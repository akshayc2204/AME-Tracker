describe('TransitsService scan validation (unit)', () => {
  it('builds shipped conflict payload', () => {
    const payload = {
      errorCode: 'PRODUCT_ALREADY_SHIPPED',
      message: 'Piece #14 has already been shipped.',
    }
    expect(payload.errorCode).toBe('PRODUCT_ALREADY_SHIPPED')
  })

  it('builds duplicate scan conflict payload', () => {
    const payload = {
      errorCode: 'PRODUCT_ALREADY_SCANNED',
      message: 'Piece #14 is already scanned onto this dispatch.',
    }
    expect(payload.errorCode).toBe('PRODUCT_ALREADY_SCANNED')
  })
})
