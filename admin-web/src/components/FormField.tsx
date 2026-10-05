import React from 'react';
import './FormField.css';

export type FormFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
};

export default function FormField({
  label,
  value,
  onChange,
  disabled = false,
  placeholder,
  type = 'text',
}: FormFieldProps): JSX.Element {
  return (
    <div className="form-field">
      <label className="form-field-label">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        className={`form-field-input${
          disabled ? ' form-field-input-disabled' : ''
        }`}
      />
    </div>
  );
}