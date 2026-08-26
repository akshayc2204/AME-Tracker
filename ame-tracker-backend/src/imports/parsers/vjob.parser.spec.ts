import { parseVjob } from './vjob.parser'

describe('parseVjob', () => {
  it('parses header and unique ItemTracking pieces', () => {
    const content = `Format=T4VExport
Project Name=EXT/SABIYA CCGT-2
Job Name=P47184 - STG GF FO 1
Job ID=70037
Download ID=68
Start Items
ItemTracking=4592865
IDJob=70037
ItemID=150
Fitting=Standard Duct
PieceNbr=1
TrackingStatus=None
End
ItemTracking=4592866
IDJob=70037
ItemID=150
Fitting=Standard Duct
PieceNbr=1
TrackingStatus=None
End
`

    const result = parseVjob(content)
    expect(result.header.jobCode).toBe('P47184')
    expect(result.header.projectName).toBe('EXT/SABIYA CCGT-2')
    expect(result.items).toHaveLength(2)
    expect(result.items[0].itemTracking).toBe('4592865')
    expect(result.items[1].pieceNbr).toBe('1')
  })
})
