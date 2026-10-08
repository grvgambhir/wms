import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes } from 'react';

export const authFieldClassName =
  'h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

export const authPrimaryButtonClassName =
  'mt-6 h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:opacity-60';

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> & {
  readonly label: string;
  readonly className?: string;
};

export function PasswordField({ label, className = '', id, ...inputProps }: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="block text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={fieldId}
          {...inputProps}
          type={visible ? 'text' : 'password'}
          spellCheck={false}
          className={`${authFieldClassName} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-text-muted transition hover:text-text"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
        </button>
      </div>
    </div>
  );
}
