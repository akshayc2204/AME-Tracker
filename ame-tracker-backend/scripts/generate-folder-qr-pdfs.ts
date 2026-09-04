/**
 * Generate job-wise QR code PDFs from a folder of paired .t4vjob + .xlsx files.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/generate-folder-qr-pdfs.ts [inputDir] [outputDir]
 */
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { readFile } from 'fs/promises'
import { parseVjob } from '../src/imports/parsers/vjob.parser'
import { parseJobReport } from '../src/imports/parsers/job-report.parser'
import { combineItemSchedule } from '../src/imports/join-schedule'

interface Label {
  jobName: string
  sourceJobId: string
  projectName: string
  pieceNumber: string
  fitting: string
  metal: string
  gauge: string
  dimensions: string
  unitIndex: number
  totalUnits: number
  qrCode: string
}

function qrForTracking(itemTracking: string): string {
  return `t4v-${itemTracking}`.toLowerCase()
}

function buildLabelList(
  sourceJobId: string,
  jobName: string,
  projectName: string,
  combined: ReturnType<typeof combineItemSchedule>,
): Label[] {
  const labels: Label[] = []

  for (const row of combined.rows) {
    const totalUnits = Math.max(row.units.length, row.quantity, 1)
    for (let idx = 0; idx < totalUnits; idx++) {
      const trk = row.units[idx]
      const qrCode = trk?.itemTracking
        ? qrForTracking(trk.itemTracking)
        : `sched-j${sourceJobId}-i${row.sourceItemId}-u${idx + 1}`.toLowerCase()

      labels.push({
        jobName,
        sourceJobId,
        projectName,
        pieceNumber: row.alphaNumber || row.pieceNumber || String(row.sourceItemId),
        fitting: trk?.fitting || row.fitting || 'Fitting',
        metal: row.metal || '',
        gauge: row.gauge ? `${row.gauge} ga` : '',
        dimensions: row.dimensions || '',
        unitIndex: idx + 1,
        totalUnits,
        qrCode,
      })
    }
  }

  return labels
}

async function generatePdfForLabels(
  sourceJobId: string,
  jobName: string,
  labelList: Label[],
  outputPath: string,
): Promise<{ totalPages: number }> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 30,
    bufferPages: true,
    info: {
      Title: `QR Codes - Job ${sourceJobId} (${jobName})`,
      Author: 'AME Tracker',
    },
  })

  const writeStream = fs.createWriteStream(outputPath)
  doc.pipe(writeStream)

  const PAGE_WIDTH = 595.28
  const PAGE_HEIGHT = 841.89
  const MARGIN_X = 25
  const MARGIN_Y = 45
  const COLS = 2
  const ROWS = 4
  const LABELS_PER_PAGE = COLS * ROWS
  const GRID_WIDTH = PAGE_WIDTH - MARGIN_X * 2
  const GRID_HEIGHT = PAGE_HEIGHT - MARGIN_Y * 2 - 10
  const COL_GAP = 12
  const ROW_GAP = 10
  const CARD_WIDTH = (GRID_WIDTH - COL_GAP * (COLS - 1)) / COLS
  const CARD_HEIGHT = (GRID_HEIGHT - ROW_GAP * (ROWS - 1)) / ROWS
  const QR_SIZE = 76

  const qrBuffers = await Promise.all(
    labelList.map((label) =>
      QRCode.toBuffer(label.qrCode, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
        color: { dark: '#0f172a', light: '#ffffff' },
      }),
    ),
  )

  for (let i = 0; i < labelList.length; i++) {
    const label = labelList[i]
    const qrBuffer = qrBuffers[i]
    const indexOnPage = i % LABELS_PER_PAGE

    if (indexOnPage === 0 && i > 0) doc.addPage()

    if (indexOnPage === 0) {
      doc.save()
      doc.rect(MARGIN_X, 15, GRID_WIDTH, 24).fill('#f8fafc')
      doc.rect(MARGIN_X, 15, GRID_WIDTH, 24).strokeColor('#e2e8f0').lineWidth(0.75).stroke()
      doc
        .fillColor('#1e293b')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`AME TRACKER  |  Job #${label.sourceJobId}: ${label.jobName}`, MARGIN_X + 8, 22)
      doc
        .fillColor('#64748b')
        .fontSize(8)
        .font('Helvetica')
        .text(
          `Project: ${label.projectName}  •  Total Parts: ${labelList.length}`,
          MARGIN_X + 8,
          22,
          { align: 'right', width: GRID_WIDTH - 16 },
        )
      doc.restore()
    }

    const col = indexOnPage % COLS
    const row = Math.floor(indexOnPage / COLS)
    const x = MARGIN_X + col * (CARD_WIDTH + COL_GAP)
    const y = MARGIN_Y + 12 + row * (CARD_HEIGHT + ROW_GAP)

    doc.save()
    doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6).fill('#ffffff')
    doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 6).strokeColor('#cbd5e1').lineWidth(0.8).stroke()
    doc.roundedRect(x, y, CARD_WIDTH, 4, 2).fill('#7c3aed')

    const qrX = x + 8
    const qrY = y + 10
    doc.image(qrBuffer, qrX, qrY, { width: QR_SIZE, height: QR_SIZE })
    doc.rect(qrX - 1, qrY - 1, QR_SIZE + 2, QR_SIZE + 2).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
    doc
      .font('Courier')
      .fontSize(5.5)
      .fillColor('#64748b')
      .text(label.qrCode, qrX - 2, qrY + QR_SIZE + 4, {
        width: QR_SIZE + 4,
        align: 'center',
        lineBreak: true,
      })

    const contentX = x + QR_SIZE + 18
    const contentWidth = CARD_WIDTH - (QR_SIZE + 24)
    let curY = y + 8

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#0f172a')
      .text(`Piece #${label.pieceNumber}`, contentX, curY)
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#7c3aed')
      .text(`Unit ${label.unitIndex} of ${label.totalUnits}`, contentX, curY + 1, {
        align: 'right',
        width: contentWidth,
      })

    curY += 16
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#334155')
      .text(label.fitting, contentX, curY, { width: contentWidth, height: 12, ellipsis: true })

    curY += 13
    const spec = [label.metal, label.gauge, label.dimensions].filter(Boolean).join(' • ')
    if (spec) {
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#475569')
        .text(spec, contentX, curY, { width: contentWidth, height: 18, ellipsis: true })
      curY += 16
    }

    doc
      .moveTo(contentX, curY)
      .lineTo(contentX + contentWidth, curY)
      .strokeColor('#f1f5f9')
      .lineWidth(0.75)
      .stroke()
    curY += 4
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#64748b')
      .text(`Job #${label.sourceJobId}  •  ${label.projectName}`, contentX, curY, {
        width: contentWidth,
        height: 10,
        ellipsis: true,
      })
    doc.restore()
  }

  const range = doc.bufferedPageRange()
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p)
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#94a3b8')
      .text(
        `Job ${sourceJobId} — Page ${p + 1} of ${range.count} (${labelList.length} total QR stickers)`,
        MARGIN_X,
        PAGE_HEIGHT - 22,
        { align: 'center', width: GRID_WIDTH },
      )
  }

  doc.end()
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })

  return { totalPages: range.count }
}

async function processJobPair(
  t4vPath: string,
  xlsxPath: string,
  outputDir: string,
): Promise<{
  file: string
  sourceJobId: string
  jobName: string
  items: number
  units: number
  pages: number
  filename: string
} | null> {
  const base = path.basename(t4vPath, path.extname(t4vPath))

  if (!fs.existsSync(xlsxPath)) {
    console.warn(`[Skip] ${t4vPath} — no matching xlsx at ${xlsxPath}`)
    return null
  }

  const vjob = parseVjob(await readFile(t4vPath, 'utf8'))
  const report = await parseJobReport(await readFile(xlsxPath))
  const combined = combineItemSchedule(vjob, report)

  const sourceJobId = vjob.header.jobId || combined.header.jobId || base
  const jobName = vjob.header.jobName || combined.header.jobName || `Job ${sourceJobId}`
  const projectName = vjob.header.projectName || combined.header.projectName || 'General Project'

  const labelList = buildLabelList(sourceJobId, jobName, projectName, combined)
  if (labelList.length === 0) {
    console.warn(`[Skip] Job #${sourceJobId} (${base}) — 0 units`)
    return null
  }

  const sanitizedJobName = jobName.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 35)
  const filename = `Job_${sourceJobId}_${sanitizedJobName}_QRCodes.pdf`
  const outputPath = path.join(outputDir, filename)

  console.log(
    `[Generating] ${base} → Job #${sourceJobId} "${jobName}" — ${combined.rows.length} items, ${labelList.length} QR stickers`,
  )

  const { totalPages } = await generatePdfForLabels(
    sourceJobId,
    jobName,
    labelList,
    outputPath,
  )

  return {
    file: base,
    sourceJobId,
    jobName,
    items: combined.rows.length,
    units: labelList.length,
    pages: totalPages,
    filename,
  }
}

async function main() {
  const arg2 = process.argv[2]
  const arg3 = process.argv[3]
  const defaultOutputDir = 'G:/AME tracking Project documents/Fw_ fabshop data/QR_PDFs'

  const results: Array<{
    file: string
    sourceJobId: string
    jobName: string
    items: number
    units: number
    pages: number
    filename: string
  }> = []

  let outputDir = defaultOutputDir

  // Single job mode: ts-node script.ts <t4vjob> <xlsx> [outputDir]
  if (arg2?.toLowerCase().endsWith('.t4vjob')) {
    const t4vPath = path.resolve(arg2)
    const xlsxPath = path.resolve(arg3 || t4vPath.replace(/\.t4vjob$/i, '.xlsx'))
    const outputDirResolved = path.resolve(process.argv[4] || defaultOutputDir)
    outputDir = outputDirResolved

    if (!fs.existsSync(t4vPath)) {
      console.error(`t4vjob file not found: ${t4vPath}`)
      process.exit(1)
    }
    fs.mkdirSync(outputDirResolved, { recursive: true })
    console.log(`Output folder:\n  ${outputDirResolved}\n`)

    try {
      const res = await processJobPair(t4vPath, xlsxPath, outputDirResolved)
      if (res) results.push(res)
    } catch (err) {
      console.error('[Failed]:', err)
      process.exit(1)
    }
  } else {
    const inputDir = arg2 || 'G:/AME tracking Project documents/Fw_ fabshop data'
    outputDir = arg3 || path.join(inputDir, 'QR_PDFs')

    if (!fs.existsSync(inputDir)) {
      console.error(`Input folder not found: ${inputDir}`)
      process.exit(1)
    }
    fs.mkdirSync(outputDir, { recursive: true })

    const t4vFiles = fs
      .readdirSync(inputDir)
      .filter((f) => f.toLowerCase().endsWith('.t4vjob'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    console.log(`Found ${t4vFiles.length} .t4vjob files in:\n  ${inputDir}\n`)
    console.log(`Output folder:\n  ${outputDir}\n`)

    for (const t4vFile of t4vFiles) {
      const base = path.basename(t4vFile, path.extname(t4vFile))
      try {
        const res = await processJobPair(
          path.join(inputDir, t4vFile),
          path.join(inputDir, `${base}.xlsx`),
          outputDir,
        )
        if (res) results.push(res)
      } catch (err) {
        console.error(`[Failed] ${base}:`, err)
      }
    }
  }

  console.log('\n================ GENERATION SUMMARY ================')
  console.log(`Generated ${results.length} PDF files\n`)
  for (const r of results) {
    console.log(
      `  ${r.filename} — ${r.items} items, ${r.units} stickers, ${r.pages} pages`,
    )
  }
  console.log(`\nAll PDFs saved to: ${outputDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
