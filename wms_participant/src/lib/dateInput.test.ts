import {
  applyDateInputEdit,
  digitsToStoredValue,
  formatDateInputMask,
  formatTypedDate,
  parseDateInputDigits,
  storedValueToDigits,
} from './dateInput';

function typeDigits(sequence: string): string {
  let digits = '';
  for (const char of sequence) {
    digits = applyDateInputEdit(`${formatTypedDate(digits)}${char}`, digits);
  }
  return digits;
}

describe('dateInput', () => {
  it('formats empty input as full placeholder mask', () => {
    expect(formatDateInputMask('')).toBe('YYYY-MM-DD');
  });

  it('auto-inserts dashes as digits are entered', () => {
    expect(formatDateInputMask('1')).toBe('1YYY-MM-DD');
    expect(formatDateInputMask('1985')).toBe('1985-MM-DD');
    expect(formatDateInputMask('198503')).toBe('1985-03-DD');
    expect(formatDateInputMask('19850315')).toBe('1985-03-15');
  });

  it('keeps placeholders out of the typed input value', () => {
    expect(formatTypedDate('')).toBe('');
    expect(formatTypedDate('1')).toBe('1');
    expect(formatTypedDate('1985')).toBe('1985-');
    expect(formatTypedDate('19850')).toBe('1985-0');
    expect(formatTypedDate('198503')).toBe('1985-03-');
    expect(formatTypedDate('1985031')).toBe('1985-03-1');
    expect(formatTypedDate('19850315')).toBe('1985-03-15');
  });

  it('accepts digits sequentially without the field already being full', () => {
    expect(typeDigits('19850315')).toBe('19850315');
    expect(digitsToStoredValue(typeDigits('19850315'))).toBe('1985-03-15');
    expect(formatTypedDate('1985').length).toBeLessThan(10);
  });

  it('stores partial and complete values for forms', () => {
    expect(digitsToStoredValue('')).toBe('');
    expect(digitsToStoredValue('1985')).toBe('1985');
    expect(digitsToStoredValue('198503')).toBe('1985-03');
    expect(digitsToStoredValue('1985031')).toBe('1985-03-1');
    expect(digitsToStoredValue('19850315')).toBe('1985-03-15');
  });

  it('round-trips stored values back to digits', () => {
    expect(storedValueToDigits('1985-03-15')).toBe('19850315');
    expect(storedValueToDigits('1985-03')).toBe('198503');
    expect(storedValueToDigits('1985')).toBe('1985');
  });

  it('strips non-digits on paste', () => {
    expect(parseDateInputDigits('19-85-03-15')).toBe('19850315');
    expect(applyDateInputEdit('1985-03-15', '')).toBe('19850315');
  });

  it('removes the last digit when backspacing over a dash', () => {
    expect(applyDateInputEdit('1985', '1985')).toBe('198');
    expect(applyDateInputEdit('1985-03', '198503')).toBe('19850');
  });
});
