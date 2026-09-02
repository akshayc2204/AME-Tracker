import { itemToScheduleValues, schedulePieceNbr } from './item-schedule'

describe('schedulePieceNbr', () => {
  it('keeps numeric # when it already differs from Alpha #', () => {
    expect(schedulePieceNbr('5', '5A')).toBe('5')
    expect(schedulePieceNbr('17', '17-')).toBe('17')
  })

  it('strips the Alpha suffix when older imports stored Alpha # in both fields', () => {
    expect(schedulePieceNbr('5A', '5A')).toBe('5')
    expect(schedulePieceNbr('5-', '5-')).toBe('5')
    expect(schedulePieceNbr('5B', '5B')).toBe('5')
    expect(schedulePieceNbr('10-', '10-')).toBe('10')
  })

  it('leaves a plain number unchanged when both fields match', () => {
    expect(schedulePieceNbr('5', '5')).toBe('5')
  })
})

describe('itemToScheduleValues', () => {
  it('maps PieceNbr from # and Alpha number from Alpha #', () => {
    const values = itemToScheduleValues({
      fitting: 'Transition 4 Piece',
      pieceNumber: '5',
      alphaNumber: '5A',
      quantity: 1,
    })
    expect(values.PieceNbr).toBe('5')
    expect(values['Alpha number']).toBe('5A')
  })

  it('splits duplicated Alpha # values from older imports', () => {
    const values = itemToScheduleValues({
      fitting: 'Transition 4 Piece',
      pieceNumber: '5A',
      alphaNumber: '5A',
      quantity: 1,
    })
    expect(values.PieceNbr).toBe('5')
    expect(values['Alpha number']).toBe('5A')
  })
})
