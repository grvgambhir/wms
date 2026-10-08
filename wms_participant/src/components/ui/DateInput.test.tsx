import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { DateInput } from './DateInput';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <DateInput value={value} onChangeText={setValue} accessibilityLabel="Date of birth" />;
}

describe('DateInput', () => {
  it('lets the user type a full date without the mask blocking keystrokes', () => {
    const { getByLabelText } = render(<Harness />);
    const input = getByLabelText('Date of birth');

    expect(input.props.value).toBe('');
    expect(input.props.maxLength).toBe(10);

    fireEvent.changeText(input, '1');
    expect(input.props.value).toBe('1');

    fireEvent.changeText(input, '19');
    expect(input.props.value).toBe('19');

    fireEvent.changeText(input, '198');
    expect(input.props.value).toBe('198');

    fireEvent.changeText(input, '1985');
    expect(input.props.value).toBe('1985-');

    fireEvent.changeText(input, '1985-0');
    expect(input.props.value).toBe('1985-0');

    fireEvent.changeText(input, '1985-03');
    expect(input.props.value).toBe('1985-03-');

    fireEvent.changeText(input, '1985-03-1');
    expect(input.props.value).toBe('1985-03-1');

    fireEvent.changeText(input, '1985-03-15');
    expect(input.props.value).toBe('1985-03-15');
  });

  it('loads an existing ISO date without placeholders in the field value', () => {
    const { getByLabelText } = render(<Harness initial="1985-03-15" />);
    expect(getByLabelText('Date of birth').props.value).toBe('1985-03-15');
  });
});
