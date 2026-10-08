import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';

type PageCtaPanelProps = {
  title: string;
  description?: string;
  /** Optional gesture on the hint (e.g. tester-only reset). */
  onDescriptionPress?: () => void;
  /** Primary control — keep it inside this card, not as a naked rail button. */
  action: ReactNode;
};

/**
 * Hub aside for wide web: copy + CTA in one card.
 * SplitPageLayout rails should use this instead of a lone `w-full` GradientButton.
 */
export function PageCtaPanel({ title, description, onDescriptionPress, action }: PageCtaPanelProps) {
  const descriptionNode = description ? (
    <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
  ) : null;

  return (
    <GlassSurface className="gap-3 p-5">
      <Text accessibilityRole="header" className="text-base font-bold text-foreground">{title}</Text>
      {onDescriptionPress && descriptionNode ? (
        <Pressable onPress={onDescriptionPress} accessibilityRole="button" accessibilityLabel={description}>
          {descriptionNode}
        </Pressable>
      ) : (
        descriptionNode
      )}
      <View>{action}</View>
    </GlassSurface>
  );
}
