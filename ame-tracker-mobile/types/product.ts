export interface Product {
  blnk: any;
  id: string;
  name: string;
  type: string;
  company: string;
  project: string;
  job: string;
  soNumber?: string;
  location?: string;
  specifications?: {
    material?: string;
    pressure?: string;
    dimensions?: string;
    radius?: string;
    size?: string;
    piece?:string;
    liner?: string;
    seam?: string;
  };
  measurements?: {
    length?: string;
    width?: string;
    height?: string;
  };
  quantity: number;
  date: string;
  dlNumber?: string;
  temperature?: string;
  weight?: string;

  pieceNumber?: string;
  fitting?: string;
  trackingStatus?: string;
  component?: boolean;
  storage?: string;
  scannedCode?: string;
 additionalInfo?: string | { // Allow both string and object
    sheetNumber?: string;
    materialUsed?: string;
    jobNumber?: string;
    materialSize?: string;
    cutDimensions?: string;
  };
}

export interface ScanResult {
  type: string;
  data: string;
  timestamp: number;
}