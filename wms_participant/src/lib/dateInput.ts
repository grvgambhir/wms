const MASK_TEMPLATE = ['Y', 'Y', 'Y', 'Y', '-', 'M', 'M', '-', 'D', 'D'] as const;

/** Strip to up to 8 date digits (YYYYMMDD). */
export function parseDateInputDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

/** Render YYYY-MM-DD with Y/M/D placeholders for unfilled digit slots. */
export function formatDateInputMask(digits: string): string {
  let digitIndex = 0;
  return MASK_TEMPLATE
    .map((slot) => {
      if (slot === 'Y' || slot === 'M' || slot === 'D') {
        if (digitIndex < digits.length) {
          return digits[digitIndex++];
        }
        return slot;
      }
      return slot;
    })
    .join('');
}

/** Visible TextInput value: typed digits plus auto-inserted dashes, no placeholders. */
export function formatTypedDate(digits: string): string {
  if (!digits) return '';
  if (digits.length < 4) return digits;
  if (digits.length === 4) return `${digits}-`;
  if (digits.length < 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 6) return `${digits.slice(0, 4)}-${digits.slice(4)}-`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function maskHasPlaceholders(mask: string): boolean {
  return /[YMD]/.test(mask);
}

export function digitsToIsoDate(digits: string): string {
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** Form value while typing: partial hyphenated string, or full ISO when complete. */
export function digitsToStoredValue(digits: string): string {
  if (!digits) return '';
  if (digits.length === 8) return digitsToIsoDate(digits);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function storedValueToDigits(value: string): string {
  return parseDateInputDigits(value);
}

/** Apply an edit from TextInput, including backspace over auto-inserted dashes. */
export function applyDateInputEdit(rawText: string, previousDigits: string): string {
  const newDigits = parseDateInputDigits(rawText);

  if (newDigits.length < previousDigits.length) {
    return newDigits;
  }

  const previousTyped = formatTypedDate(previousDigits);
  if (rawText.length < previousTyped.length && newDigits.length === previousDigits.length) {
    return previousDigits.slice(0, -1);
  }

  return newDigits.slice(0, 8);
}
