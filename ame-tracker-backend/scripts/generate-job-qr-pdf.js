const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateJobQrPdf(sourceJobId, outputPath) {
  console.log(`Fetching data for job ${sourceJobId}...`);
  const job = await prisma.job.findFirst({
    where: { sourceJobId: String(sourceJobId) },
    include: {
      project: true,
      items: {
        include: {
          units: {
            orderBy: { unitIndex: 'asc' },
          },
        },
        orderBy: [
          { sourceItemId: 'asc' },
        ],
      },
    },
  });

  if (!job) {
    throw new Error(`Job with source ID ${sourceJobId} not found in database.`);
  }

  // Flatten all units with item context
  const labelList = [];
  for (const item of job.items) {
    const totalUnitsInItem = item.units.length;
    for (const unit of item.units) {
      labelList.push({
        jobName: job.jobName,
        sourceJobId: job.sourceJobId,
        projectName: job.project ? job.project.projectName : 'General Project',
        pieceNumber: item.pieceNumber || String(item.sourceItemId),
        sourceItemId: item.sourceItemId,
        fitting: item.fitting || 'Fitting',
        metal: item.metal || '',
        gauge: item.gauge ? `${item.gauge} ga` : '',
        dimensions: item.dimensions || '',
        unitIndex: unit.unitIndex,
        totalUnits: totalUnitsInItem,
        qrCode: unit.qrCode,
        trackingStatus: unit.trackingStatus || item.trackingStatus || '',
      });
    }
  }

  console.log(`Found ${job.items.length} items with ${labelList.length} total QR units.`);

  // PDF Layout configuration (A4 Page: 595.28 x 841.89 points)
  const doc = new PDFDocument({
    size: 'A4',
    margin: 30,
    bufferPages: true,
    info: {
      Title: `QR Codes - Job ${job.sourceJobId} (${job.jobName})`,
      Author: 'AME Tracker',
    },
  });

  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 25;
  const MARGIN_Y = 45;
  const COLS = 2;
  const ROWS = 4; // 8 labels per page for high readability and easy peeling
  const LABELS_PER_PAGE = COLS * ROWS;

  const GRID_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);
  const GRID_HEIGHT = PAGE_HEIGHT - (MARGIN_Y * 2) - 10;
  const COL_GAP = 12;
  const ROW_GAP = 10;

  const CARD_WIDTH = (GRID_WIDTH - (COL_GAP * (COLS - 1))) / COLS;
  const CARD_HEIGHT = (GRID_HEIGHT - (ROW_GAP * (ROWS - 1))) / ROWS;

  const QR_SIZE = 76;

  console.log(`Generating QR code images for ${labelList.length} units...`);
  // Generate QR buffers in memory
  const qrBuffers = await Promise.all(
    labelList.map((label) =>
      QRCode.toBuffer(label.qrCode, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
    )
  );

  for (let i = 0; i < labelList.length; i++) {
    const label = labelList[i];
    const qrBuffer = qrBuffers[i];
    const pageIndex = Math.floor(i / LABELS_PER_PAGE);
    const indexOnPage = i % LABELS_PER_PAGE;

    if (indexOnPage === 0 && i > 0) {
      doc.addPage();
    }

    // Draw Page Header on top of each page
    if (indexOnPage === 0) {
      doc.save();
      // Header background
      doc.rect(MARGIN_X, 15, GRID_WIDTH, 24)
        .fill('#f8fafc');
      doc.rect(MARGIN_X, 15, GRID_WIDTH, 24)
        .strokeColor('#e2e8f0').lineWidth(0.75).stroke();

      doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold')
        .text(`AME TRACKER  |  Job #${label.sourceJobId}: ${label.jobName}`, MARGIN_X + 8, 22);

      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
        .text(`Project: ${label.projectName}  •  Total Parts: ${labelList.length}`, MARGIN_X + 8, 22, {
          align: 'right',
          width: GRID_WIDTH - 16,
        });
      doc.restore();
    }

    const col = indexOnPage % COLS;
    const row = Math.floor(indexOnPage / COLS);

    const x = MARGIN_X + (col * (CARD_WIDTH + COL_GAP));
    const y = MARGIN_Y + 12 + (row * (CARD_HEIGHT + ROW_GAP));

    // Draw Label Card Container
    doc.save();
    
    // Background
    doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6)
      .fill('#ffffff');
    
    // Border
    doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6)
      .strokeColor('#cbd5e1').lineWidth(0.8).stroke();

    // Top color accent bar
    doc.roundedRect(x, y, CARD_WIDTH, 4, 2)
      .fill('#7c3aed');

    // QR Code on Left
    const qrX = x + 8;
    const qrY = y + 10;
    doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });

    // QR Box outline
    doc.rect(qrX - 1, qrY - 1, QR_SIZE + 2, QR_SIZE + 2)
      .strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    // Human-readable QR Code String underneath QR
    doc.font('Courier').fontSize(5.5).fillColor('#64748b')
      .text(label.qrCode, qrX - 2, qrY + QR_SIZE + 4, {
        width: QR_SIZE + 4,
        align: 'center',
        lineBreak: true,
      });

    // Right Content Info Area
    const contentX = x + QR_SIZE + 18;
    const contentWidth = CARD_WIDTH - (QR_SIZE + 24);
    let curY = y + 8;

    // Piece / Item Header Badge
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
      .text(`Piece #${label.pieceNumber}`, contentX, curY);
    
    // Unit badge (Unit X of Y)
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#7c3aed')
      .text(`Unit ${label.unitIndex} of ${label.totalUnits}`, contentX, curY + 1, {
        align: 'right',
        width: contentWidth,
      });

    curY += 16;

    // Fitting Name
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#334155')
      .text(label.fitting, contentX, curY, {
        width: contentWidth,
        height: 12,
        ellipsis: true,
      });

    curY += 13;

    // Metal & Gauge Line
    const spec = [label.metal, label.gauge, label.dimensions].filter(Boolean).join(' • ');
    if (spec) {
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
        .text(spec, contentX, curY, {
          width: contentWidth,
          height: 18,
          ellipsis: true,
        });
      curY += 16;
    }

    // Divider line
    doc.moveTo(contentX, curY)
      .lineTo(contentX + contentWidth, curY)
      .strokeColor('#f1f5f9').lineWidth(0.75).stroke();

    curY += 4;

    // Job and Project reference
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748b')
      .text(`Job #${label.sourceJobId}  •  ${label.projectName}`, contentX, curY, {
        width: contentWidth,
        height: 10,
        ellipsis: true,
      });

    doc.restore();
  }

  // Add Page Numbers footer across all pages
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8')
      .text(
        `Job ${job.sourceJobId} — Page ${p + 1} of ${range.count} (${labelList.length} total QR stickers)`,
        MARGIN_X,
        PAGE_HEIGHT - 22,
        { align: 'center', width: GRID_WIDTH }
      );
  }

  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  console.log(`PDF successfully generated at: ${outputPath}`);
  return {
    jobName: job.jobName,
    projectName: job.project ? job.project.projectName : '',
    totalItems: job.items.length,
    totalUnits: labelList.length,
    totalPages: range.count,
    outputPath,
  };
}

// Execution
const outputTarget = path.resolve('g:/AME-Tracker/AME-Tracker/Job-70037-QRCodes.pdf');
generateJobQrPdf('70037', outputTarget)
  .then((res) => {
    console.log('Result:', JSON.stringify(res, null, 2));
  })
  .catch((err) => {
    console.error('Error generating PDF:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
