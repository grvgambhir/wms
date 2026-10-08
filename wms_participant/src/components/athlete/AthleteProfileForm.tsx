import { CalendarDays } from 'lucide-react-native';
import { Children, type ComponentProps, type ReactNode } from 'react';
import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { DateInput } from '@/components/ui/DateInput';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { ProfileFormValues } from '@/features/athlete/schemas/profileSchema';
import { useAppLayout } from '@/hooks/useAppLayout';
import { countryName, PROFILE_NATIONALITIES } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const GENDER_OPTIONS = [
  { id: 'male', label: copy.profileGenderMale },
  { id: 'female', label: copy.profileGenderFemale },
  { id: 'other', label: copy.profileGenderOther },
] as const;

type AthleteProfileFormProps = {
  control: Control<ProfileFormValues>;
  errors: FieldErrors<ProfileFormValues>;
  /** Login identifier — shown, not edited (POC). */
  emailLocked?: boolean;
};

type LabeledFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  trailing?: ReactNode;
  locked?: boolean;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'onBlur'>;

function FieldRow({ children }: { children: React.ReactNode }) {
  const { isWideWeb } = useAppLayout();
  return (
    <View className={cn('gap-3', isWideWeb && 'flex-row items-start')}>
      {Children.map(children, (child) => (
        <View className={cn(isWideWeb && 'min-w-0 flex-1')}>{child}</View>
      ))}
    </View>
  );
}

/** Label sits above the box — same pattern as Gender / Nationality chips on this form. */
function LabeledField({
  label,
  value,
  onChange,
  onBlur,
  error,
  trailing,
  locked,
  ...props
}: LabeledFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold text-primary">{label}</Text>
      <View className="relative justify-center">
        <Input
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          editable={!locked}
          className={cn('h-12 rounded-xl bg-white', trailing && 'pr-10', locked && 'opacity-70')}
          {...props}
        />
        {trailing ? <View className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</View> : null}
      </View>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}

/** Shared identity form — Profile tab is the source of truth (not a registration wizard step). */
export function AthleteProfileForm({ control, errors, emailLocked = true }: AthleteProfileFormProps) {
  return (
    <View className="gap-4">
      <GlassSurface className="gap-3 p-4">
        <Text className="text-sm font-bold text-primary">{copy.profilePersonalSection}</Text>
        <FieldRow>
          <Controller
            control={control}
            name="firstName"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profileFirstName}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.firstName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="lastName"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profileLastName}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.lastName?.message}
              />
            )}
          />
        </FieldRow>
        <Controller
          control={control}
          name="dateOfBirth"
          render={({ field: { onChange, onBlur, value } }) => (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-primary">{copy.profileDob}</Text>
              <View className="relative justify-center">
                <DateInput
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  accessibilityLabel={copy.profileDob}
                  className="h-12 rounded-xl bg-white pr-10"
                />
                <View className="absolute right-3 top-1/2 -translate-y-1/2">
                  <CalendarDays size={16} color={colors.textMuted} />
                </View>
              </View>
              {errors.dateOfBirth?.message ? (
                <Text className="text-sm text-destructive">{errors.dateOfBirth.message}</Text>
              ) : null}
            </View>
          )}
        />
        <Text className="text-xs text-muted-foreground">{copy.profileDobHint}</Text>

        <Text className="text-xs font-semibold text-primary">{copy.profileGender}</Text>
        <Controller
          control={control}
          name="gender"
          render={({ field: { onChange, value } }) => (
            <View className="flex-row flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => onChange(option.id)}
                  className={cn(
                    'rounded-full border px-4 py-2',
                    value === option.id ? 'border-primary bg-primary/10' : 'border-border bg-white',
                  )}>
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      value === option.id ? 'text-primary' : 'text-foreground',
                    )}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        />

        <Text className="text-xs font-semibold text-primary">{copy.profileNationality}</Text>
        <Controller
          control={control}
          name="nationalityCountryCode"
          render={({ field: { onChange, value } }) => (
            <View className="gap-2">
              <View className="flex-row flex-wrap gap-2">
                {PROFILE_NATIONALITIES.map((code) => (
                  <Pressable
                    key={code}
                    onPress={() => onChange(code)}
                    className={cn(
                      'rounded-full border px-3 py-2',
                      value.toUpperCase() === code ? 'border-primary bg-primary/10' : 'border-border bg-white',
                    )}>
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        value.toUpperCase() === code ? 'text-primary' : 'text-foreground',
                      )}>
                      {countryName(code)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {errors.nationalityCountryCode ? (
                <Text className="text-sm text-destructive">{errors.nationalityCountryCode.message}</Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="passportNumber"
          render={({ field: { onChange, onBlur, value } }) => (
            <LabeledField
              label={copy.profilePassport}
              value={value ?? ''}
              onChange={onChange}
              onBlur={onBlur}
              autoCapitalize="characters"
            />
          )}
        />
      </GlassSurface>

      <GlassSurface className="gap-3 p-4">
        <Text className="text-sm font-bold text-primary">{copy.profileContactSection}</Text>
        <FieldRow>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profileEmail}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                autoCapitalize="none"
                keyboardType="email-address"
                locked={emailLocked}
              />
            )}
          />
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profilePhone}
                value={value ?? ''}
                onChange={onChange}
                onBlur={onBlur}
                keyboardType="phone-pad"
              />
            )}
          />
        </FieldRow>
        {emailLocked ? <Text className="text-xs text-muted-foreground">{copy.profileEmailLocked}</Text> : null}
      </GlassSurface>

      <GlassSurface className="gap-3 p-4">
        <Text className="text-sm font-bold text-primary">{copy.profileEmergencyTitle}</Text>
        <FieldRow>
          <Controller
            control={control}
            name="emergencyContactName"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profileEmergencyName}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.emergencyContactName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="emergencyContactPhone"
            render={({ field: { onChange, onBlur, value } }) => (
              <LabeledField
                label={copy.profileEmergencyPhone}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                error={errors.emergencyContactPhone?.message}
                keyboardType="phone-pad"
              />
            )}
          />
        </FieldRow>
        <Controller
          control={control}
          name="emergencyContactRelationship"
          render={({ field: { onChange, onBlur, value } }) => (
            <LabeledField
              label={copy.profileEmergencyRelationship}
              value={value ?? ''}
              onChange={onChange}
              onBlur={onBlur}
              placeholder="Spouse, parent, friend…"
            />
          )}
        />
      </GlassSurface>
    </View>
  );
}
