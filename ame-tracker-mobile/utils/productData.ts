import { Product } from '../types/product';

// Product database based on label data from ALMULLA INDUSTRIES
export const productDatabase: Record<string, Product> = {
  // Label 1 - Piece #14 (Transition 4 Piece)
  '4076144': {
    id: '4076144',
    name: 'Transition 4 Piece',
    type: 'Transition 4 Piece',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
     // liner: 'No Liner',
     // seam: 'PITTSBURGH-A',
      dimensions: '356.0 x 102.0 SLIP; 508.0 x 203.0 T.D.',
      piece: 'Ftg: Transition 4 Piece',
    },
    measurements: {
      length: '619.0 x 466.0',
      width: 'N/A',
      height: 'N/A',
    },
    quantity: 1,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '14',
    fitting: 'Transition 4 Piece',
    blnk: '88 3/4',
    trackingStatus: 'None'
  },

  // Label 2 - Piece #2
  '00999-2': {
    id: '00999-2',
    name: 'Standard Duct',
    type: 'Standard Duct',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
    //  liner: 'No Liner',
     // seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 305.0 T.D.; 2:508.0 x 305.0 T.D.',
      piece: 'Ftg: Standard Duct',
    },
    measurements: {
      length: '1200.0 x 1671.0',
      width: 'N/A',
      height: 'N/A',
    },
    quantity: 4,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '2',
    fitting: 'Standard Duct',
    blnk: '74 1/1',
    trackingStatus: 'None'
  },
  //label 14
  
'0701a3ff-db28-43f5-a815-2e595bf1e3e5': {
    id: '0701a3ff-db28-43f5-a815-2e595bf1e3e5',
    name: 'Transition 4 Piece',
    type: 'Transition 4 Piece',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41126 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:358.0 x 102.0 SLIP; 2:508.0 x 203.0 T.D.',
      piece: 'Transition 4 Piece',
    },
    measurements: {
      length: '520.0',
      width: '479.0',
      height: 'N/A',
    },
    quantity: 1,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '14',
    fitting: 'Transition 4 Piece',
    blnk: '88 1/4',
    trackingStatus: 'None'
  },
  //label 4-
  
'b7e6faa0-ca35-494c-be39-ba9d8d41310b': {
    id: 'b7e6faa0-ca35-494c-be39-ba9d8d41310b',
    name: 'End Cap',
    type: 'End Cap',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41126 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'N/A',
      dimensions: '1:503.0 x 300.0 RAW Fig. End Cap',
      piece: '603.0 x 400.0',
    },
    measurements: {
      length: '603.0',
      width: '400.0',
      height: 'N/A',
    },
    quantity: 2,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '4-',
    fitting: 'End Cap',
    blnk: '76 1/1',
    trackingStatus: 'None'
  },
  //label 4
  '530c4108-142f-428b-8cd4-2553e93ebb11': {
    id: '530c4108-142f-428b-8cd4-2553e93ebb11',
    name: 'Cut Duct',
    type: 'Cut Duct',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 305.0 T.D.; 2:508.0 x 305.0 RAW',
      piece: 'Cut Duct',
    },
    measurements: {
      length: '2000.0',
      width: '858.0',
      height: 'N/A',
    },
    quantity: 2,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '4',
    fitting: 'Fig Cut Duct',
    blnk: '75 1/2',
    trackingStatus: 'None',
    additionalInfo: {
      sheetNumber: '1',
      materialUsed: '1178.00 x 2993.00',
      jobNumber: '63849',
      materialSize: '1200.00 x 2993.00',
      cutDimensions: '308, 608, 2082, 384w, 584w'
    }
  },
//label 13

 '1a194ea7-ebfc-4dde-8dce-501354695d56': {
    id: '1a194ea7-ebfc-4dde-8dce-501354695d56',
    name: 'Cut Duct',
    type: 'Cut Duct',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23 EG-G FLOOR',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 203.0 T.D.; 2:508.0 x 203.0 T.D.',
      piece: 'Cut Duct',
    },
    measurements: {
      length: '1466.0 x 756.0',
      width: 'N/A',
      height: 'N/A',
    },
    quantity: 1,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '13',
    fitting: 'Cut Duct',
    blnk: '87 1/2',
    trackingStatus: 'None'
  },
  // Label 3 - Piece #3 (Same as Label 2 but piece #3)
  '739bfbc1-827b-4a65-b278-9d558e4763cf': {
    id: '739bfbc1-827b-4a65-b278-9d558e4763cf',
    name: 'Standard Duct',
    type: 'Standard Duct',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 305.0 T.D.; 2:508.0 x 305.0 T.D.',
      piece: 'Ftg: Standard Duct',
    },
    measurements: {
      length: '1200.0 x 1671.0',
      width: 'N/A',
      height: 'N/A',
    },
    quantity: 4,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '3',
    fitting: 'Standard Duct',
    blnk: '74 1/1',
    trackingStatus: 'None'
  },

  //label 3
  'b2dc6eb9-5404-4a1c-8cc0-197caf5129c9': {
    id: 'b2dc6eb9-5404-4a1c-8cc0-197caf5129c9',
    name: 'Standard Duct',
    type: 'Standard Duct',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 305.0 T.D.; 2:508.0 x 305.0 T.D.',
      piece: '1200.0 x 1671.0',
    },
    measurements: {
      length: '1200.0',
      width: '1671.0',
      height: 'N/A',
    },
    quantity: 4,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '3',
    fitting: 'Standard Duct',
    blnk: '74 1/1',
    trackingStatus: 'None',
    additionalInfo: {
      cutDimensions: '105x304 C, 108x504 C, 305x305 C, 106x503 C'
    }
  },
  //label 2
  '6e6a667d-bd9a-4591-ba32-e6ade3845fdc': {
    id: '6e6a667d-bd9a-4591-ba32-e6ade3845fdc',
    name: 'Transition 4 Piece',
    type: 'Transition 4 Piece',
    company: 'ALMULLA INDUSTRIES',
    project: 'INT/KCST',
    job: 'P41426 - PW 23',
    soNumber: '77008006 - 22G',
    location: 'EG-G FLOOR',
    specifications: {
      material: 'Metal In Gauge 22.00: ALGHURAIR-',
      pressure: 'MEW TDC',
      liner: 'No Liner',
      seam: 'PITTSBURGH-A',
      dimensions: '1:508.0 x 305.0 T.D.; 2:762.0 x 406.0 T.D.',
      piece: '769.0 x 514.0',
    },
    // measurements: {
    //   length: '769.0',
    //   width: '514.0',
    //   height: 'N/A',
    // },
    quantity: 2,
    date: '10/21/2025',
    dlNumber: '1162',
    pieceNumber: '2',
    fitting: 'Standard Duct',
    blnk: '73 1/4',
    trackingStatus: 'None',
    
  },
};

// Helper function to parse QR code data (handles JSON format)
export const parseQRCode = (scannedData: string): string | null => {
  try {
    // Try to parse as JSON first (e.g., {"ItemID":"uuid"})
    const parsed = JSON.parse(scannedData);
    return parsed.ItemID || parsed.id || null;
  } catch (e) {
    // If not JSON, return the scanned data as-is
    return scannedData;
  }
};

export const getProductById = (id: string): Product | null => {
  return productDatabase[id] || null;
};

export const searchProducts = (query: string): Product[] => {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const lowercaseQuery = query.toLowerCase().trim();
  if (!lowercaseQuery) return [];
  
  return Object.values(productDatabase).filter(product => {
    const id = product.id.toLowerCase();
    return (
      // Basic fields
      id === q ||                    // exact
      id.startsWith(q) ||            // half ID prefix (most important)
      id.includes(q) || 
      product.name.toLowerCase().includes(q) ||
      (product.project && product.project.toLowerCase().includes(q)) ||
      (product.job && product.job.toLowerCase().includes(q)) ||
      (product.pieceNumber && product.pieceNumber.toLowerCase().includes(q)) ||
      (product.specifications?.dimensions && product.specifications.dimensions.toLowerCase().includes(q)) ||
      product.id.toLowerCase().includes(lowercaseQuery) ||
      product.name.toLowerCase().includes(lowercaseQuery) ||
      product.type.toLowerCase().includes(lowercaseQuery) ||
      product.project.toLowerCase().includes(lowercaseQuery) ||
      product.company.toLowerCase().includes(lowercaseQuery) ||
      
      // Additional fields
      (product.job && product.job.toLowerCase().includes(lowercaseQuery)) ||
      (product.soNumber && product.soNumber.toLowerCase().includes(lowercaseQuery)) ||
      (product.dlNumber && product.dlNumber.toLowerCase().includes(lowercaseQuery)) ||
      (product.location && product.location.toLowerCase().includes(lowercaseQuery)) ||
      (product.pieceNumber && product.pieceNumber.toLowerCase().includes(lowercaseQuery)) ||
      
      // Specifications fields
      (product.specifications?.material && product.specifications.material.toLowerCase().includes(lowercaseQuery)) ||
      (product.specifications?.pressure && product.specifications.pressure.toLowerCase().includes(lowercaseQuery)) ||
      (product.specifications?.dimensions && product.specifications.dimensions.toLowerCase().includes(lowercaseQuery)) ||
      //(product.specifications?.liner && product.specifications.liner.toLowerCase().includes(lowercaseQuery)) ||
      //(product.specifications?.seam && product.specifications.seam.toLowerCase().includes(lowercaseQuery)) ||
      (product.specifications?.piece && product.specifications.piece.toLowerCase().includes(lowercaseQuery)) ||
      
      // Numeric fields
      (product.quantity && product.quantity.toString().includes(lowercaseQuery)) ||
      (product.blnk && product.blnk.toLowerCase().includes(lowercaseQuery))
    );
  });
};
// import { Product } from '../types/product';

// // Sample product database - in a real app, this would come from your backend/database
// export const productDatabase: Record<string, Product> = {
//   // Existing products
//   'EXTJ3MALL-P39800-5418-1': {
//     id: 'EXTJ3MALL-P39800-5418-1',
//     name: 'Standard Duct',
//     type: 'Standard Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH',
//     specifications: {
//       material: 'Metal In Gauge 24.00',
//       pressure: 'MEW TDC',
//       dimensions: '1 305.0 x 305.0 T.D.',
//       radius: 'Flg: Radius Elbow',
//       size: '2 305.0 x 305.0 T.D.',
//     },
//     measurements: {
//       length: '512.0',
//       width: '512.0',
//       height: 'Blk: 2 1/4',
//     },
//     quantity: 4,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     temperature: '305°C',
//     weight: '50',
//   },
//   'EXTJ3MALL-P39800-5418-2': {
//     id: 'EXTJ3MALL-P39800-5418-2',
//     name: 'Radius Elbow',
//     type: 'Radius Elbow',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH',
//     specifications: {
//       material: 'Metal In Gauge 24.00',
//       pressure: 'MEW TDC',
//       dimensions: '305.0 x 305.0 T.D.',
//     },
//     measurements: {
//       length: '305.0',
//       width: '305.0',
//       height: '100',
//     },
//     quantity: 2,
//     date: '06/30/2025',
//     dlNumber: '5418',
//   },
//   'EXTJ3MALL-P39800-5418-3': {
//     id: 'EXTJ3MALL-P39800-5418-3',
//     name: 'End Cap',
//     type: 'End Cap',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     quantity: 1,
//     date: '06/30/2025',
//     dlNumber: '5418',
//   },

//   // New products from Media (5).jfif
//   'INTKCST-P41426-1162-1': {
//     id: 'INTKCST-P41426-1162-1',
//     name: 'Transition 4 Piece',
//     type: 'Transition 4 Piece',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'INT/KCST',
//     job: 'P41426 - PW 23',
//     soNumber: '77008006 - 22G',
//     location: 'EG-G FLOOR',
//     specifications: {
//       material: 'Metal In Gauge 22.00: ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '356.0 x 102.0 SLIP; 508.0 x 203.0 TD',
//     },
//     measurements: {
//       length: '519.0',
//       width: '466.0',
//       height: '88 3/4',
//     },
//     quantity: 1,
//     date: '10/21/2025',
//     dlNumber: '1162',
//   },

//   // New products from G REPORT.xlsx
//   'EXTJ3MALL-P39800-5418-4': {
//     id: 'EXTJ3MALL-P39800-5418-4',
//     name: 'Standard Duct',
//     type: 'Standard Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '762.000 x 406.000; 762.000 x 406.000',
//     },
//     measurements: {
//       length: '1104.8',
//      // area: '5.703276584350276',
//     },
//     quantity: 2,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '35.86887023864708',
//   },
//   'EXTJ3MALL-P39800-5418-5': {
//     id: 'EXTJ3MALL-P39800-5418-5',
//     name: 'Transition 4 Piece',
//     type: 'Transition 4 Piece',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 305.000; 762.000 x 406.000',
//     },
//     measurements: {
//       length: '406',
//      // area: '2.171864324362497',
//     },
//     quantity: 2,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '13.659221760394429',
//   },
//   'EXTJ3MALL-P39800-5418-6': {
//     id: 'EXTJ3MALL-P39800-5418-6',
//     name: 'Standard Duct',
//     type: 'Standard Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 305.000; 508.000 x 305.000',
//     },
//     measurements: {
//       length: '1104.8',
//       //area: '7.997306579089929',
//     },
//     quantity: 4,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '50.29641254488344',
//   },
//   'EXTJ3MALL-P39800-5418-7': {
//     id: 'EXTJ3MALL-P39800-5418-7',
//     name: 'Cut Duct',
//     type: 'Cut Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 305.000; 508.000 x 305.000',
//     },
//     measurements: {
//       length: '2032',
//       //area: '7.125289938100614',
//     },
//     quantity: 2,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '44.81215252715717',
//   },
//   'EXTJ3MALL-P39800-5418-8': {
//     id: 'EXTJ3MALL-P39800-5418-8',
//     name: 'End Cap',
//     type: 'End Cap',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '503.000 x 300.000',
//     },
//     measurements: {
//       length: '0',
//       //area: '0.4625680253561271',
//     },
//     quantity: 2,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '2.909168481075215',
//   },
//   'EXTJ3MALL-P39800-5418-9': {
//     id: 'EXTJ3MALL-P39800-5418-9',
//     name: 'Increase Takeoff',
//     type: 'Increase Takeoff',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 203.000; 606.000 x 203.000',
//     },
//     measurements: {
//       length: '150',
//       //area: '0.44308988522551557',
//     },
//     quantity: 1,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '2.786667166172795',
//   },
//   'EXTJ3MALL-P39800-5418-10': {
//     id: 'EXTJ3MALL-P39800-5418-10',
//     name: 'Standard Duct',
//     type: 'Standard Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 203.000; 508.000 x 203.000',
//     },
//     measurements: {
//       length: '1104.8',
//       //area: '1.7544404163816973',
//     },
//     quantity: 1,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '11.033972262420459',
//   },
//   'EXTJ3MALL-P39800-5418-11': {
//     id: 'EXTJ3MALL-P39800-5418-11',
//     name: 'Cut Duct',
//     type: 'Cut Duct',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '508.000 x 203.000; 508.000 x 203.000',
//     },
//     measurements: {
//       length: '1371',
//       //area: '2.205005332859239',
//     },
//     quantity: 1,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '13.867651163346654',
//   },
//   'EXTJ3MALL-P39800-5418-12': {
//     id: 'EXTJ3MALL-P39800-5418-12',
//     name: 'Transition 4 Piece',
//     type: 'Transition 4 Piece',
//     company: 'ALMULLA INDUSTRIES',
//     project: 'EXT/J3 MALL',
//     job: '62,012, P39800 - PW 447',
//     soNumber: 'LINER No Liner',
//     location: 'Seam PITTSBURGH-A',
//     specifications: {
//       material: '22.00 - ALGHURAIR-',
//       pressure: 'MEW TDC',
//       dimensions: '356.000 x 102.000; 508.000 x 203.000',
//     },
//     measurements: {
//       length: '406',
//       //area: '0.6339485886807684',
//     },
//     quantity: 1,
//     date: '06/30/2025',
//     dlNumber: '5418',
//     weight: '3.987009805514173',
//   },
// };

// export const getProductById = (id: string): Product | null => {
//   return productDatabase[id] || null;
// };

// export const searchProducts = (query: string): Product[] => {
//   const lowercaseQuery = query.toLowerCase();
//   return Object.values(productDatabase).filter(product =>
//     product.id.toLowerCase().includes(lowercaseQuery) ||
//     product.name.toLowerCase().includes(lowercaseQuery) ||
//     product.type.toLowerCase().includes(lowercaseQuery) ||
//     product.project.toLowerCase().includes(lowercaseQuery) ||
//     product.company.toLowerCase().includes(lowercaseQuery)
//   );
// };