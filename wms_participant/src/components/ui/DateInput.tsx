import { useState } from 'react';
import { Platform, Text, TextInput, View, type TextInputProps } from 'react-native';

import {
  applyDateInputEdit,
  digitsToStoredValue,
  formatDateInputMask,
  formatTypedDate,
  maskHasPlaceholders,
  storedValueToDigits,
} from '@/lib/dateInput';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type DateInputProps = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType' | 'placeholder'> & {
  value: string;
  onChangeText: (value: string) => void;
  className?: string;
};

function isPlaceholderChar(char: string): boolean {
  return char === 'Y' || char === 'M' || char === 'D';
}

function MaskedDateOverlay({
  display,
  style,
  className,
}: {
  display: string;
  style?: TextInputProps['style'];
  className?: string;
}) {
  return (
    <Text
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      numberOfLines={1}
      className={className}
      style={[
        style,
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          zIndex: 1,
        },
      ]}
    >
      {display.split('').map((char, index) => (
        <Text
          key={`${index}-${char}`}
          style={{ color: isPlaceholderChar(char) ? colors.textMuted : 'transparent' }}
        >
          {char}
        </Text>
      ))}
    </Text>
  );
}

export function DateInput({ value, onChangeText, onBlur, style, className, ...rest }: DateInputProps) {
  const digits = storedValueToDigits(value);
  const typed = formatTypedDate(digits);
  const mask = formatDateInputMask(digits);
  const showOverlay = maskHasPlaceholders(mask);
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>();

  const moveCaretToEnd = (nextTyped: string) => {
    const caret = nextTyped.length;
    setSelection({ start: caret, end: caret });
  };

  const handleChange = (text: string) => {
    const nextDigits = applyDateInputEdit(text, digits);
    onChangeText(digitsToStoredValue(nextDigits));
    moveCaretToEnd(formatTypedDate(nextDigits));
  };

  const inputClassName = className
    ? cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9',
        Platform.select({
          web: 'outline-none transition-[color,box-shadow] md:text-sm',
          native: '',
        }),
        className,
      )
    : undefined;

  const overlayClassName = inputClassName
    ? cn(inputClassName, 'bg-transparent border-transparent shadow-none')
    : undefined;

  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        {...rest}
        value={typed}
        onChangeText={handleChange}
        onBlur={onBlur}
        onFocus={() => moveCaretToEnd(typed)}
        onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
        selection={selection}
        keyboardType="number-pad"
        placeholder=""
        maxLength={10}
        className={inputClassName}
        style={inputClassName ? undefined : style}
      />
      {showOverlay ? (
        <MaskedDateOverlay display={mask} style={style} className={overlayClassName} />
      ) : null}
    </View>
  );
}
