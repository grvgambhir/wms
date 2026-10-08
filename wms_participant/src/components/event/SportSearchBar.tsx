import { Search } from 'lucide-react-native';
import { View } from 'react-native';

import { Input } from '@/components/ui/input';
import { copy } from '@/constants/copy';
import { colors } from '@/theme/colors';

type SportSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

/** A05 search field with leading magnifier icon. */
export function SportSearchBar({ value, onChange }: SportSearchBarProps) {
  return (
    <View className="relative">
      <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
        <Search size={18} color={colors.textMuted} />
      </View>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={copy.searchSports}
        className="h-12 rounded-xl border-border/60 bg-white pl-11"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
