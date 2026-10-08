import { FileText, MoreVertical, Upload } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { DocumentStatus } from '@/domain/models/document';
import { formatCompactDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type DocumentCardProps = {
  label: string;
  hint?: string;
  required?: boolean;
  status: DocumentStatus;
  fileName?: string;
  uploadedAt?: string;
  onUpload?: () => void;
  uploading?: boolean;
  className?: string;
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: 'Not uploaded',
  uploaded: 'Uploaded',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** Document row for A09 — badge, file meta, and replace via kebab (POC). */
export function DocumentCard({
  label,
  hint,
  required,
  status,
  fileName,
  uploadedAt,
  onUpload,
  uploading,
  className,
}: DocumentCardProps) {
  const isComplete = status === 'uploaded' || status === 'verified';

  const openMenu = () => {
    if (!onUpload) return;
    Alert.alert(label, copy.documentsMenuTitle, [
      { text: copy.documentsMenuReplace, onPress: onUpload },
      { text: copy.documentsMenuCancel, style: 'cancel' },
    ]);
  };

  return (
    <GlassSurface className={cn('p-4 hover:border-primary/30', className)}>
      <View className="flex-row items-start gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <FileText size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">
            {label}
            {required ? <Text className="text-destructive"> *</Text> : null}
          </Text>
          {hint ? <Text className="mt-0.5 text-xs text-muted-foreground">{hint}</Text> : null}
          {isComplete ? (
            <View className="mt-2 self-start rounded-full bg-emerald-600 px-2 py-0.5">
              <Text className="text-[10px] font-bold uppercase text-white">{STATUS_LABELS[status]}</Text>
            </View>
          ) : (
            <Text className="mt-1 text-sm text-muted-foreground">{STATUS_LABELS[status]}</Text>
          )}
          {fileName ? <Text className="mt-1 text-sm font-medium text-primary">{fileName}</Text> : null}
          {uploadedAt ? (
            <Text className="mt-0.5 text-xs text-muted-foreground">{formatCompactDate(uploadedAt)}</Text>
          ) : null}
        </View>
        {isComplete && onUpload ? (
          <Pressable onPress={openMenu} className="p-1 hover:opacity-70" accessibilityLabel={copy.documentsMenuTitle}>
            <MoreVertical size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {onUpload && !isComplete ? (
        <Pressable
          onPress={onUpload}
          disabled={uploading}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 py-3 hover:bg-primary/10 active:opacity-80">
          <Upload size={16} color={colors.primary} />
          <Text className="text-sm font-semibold text-primary">
            {uploading ? copy.documentsUploading : copy.documentsUpload}
          </Text>
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}
