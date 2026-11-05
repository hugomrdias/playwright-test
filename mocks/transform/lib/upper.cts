enum Suffix {
  None = '',
}

module.exports = {
  upper: (value: string): string => value.toUpperCase() + Suffix.None,
}
