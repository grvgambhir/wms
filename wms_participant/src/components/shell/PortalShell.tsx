// PortalShell (WS-A) — the reusable responsive layout shared by the participant
// and admin portals. Desktop/tablet: persistent dark left sidebar + topbar +
// scrolling content. Compact/native: sidebar collapses into a hamburger drawer.
// Presentational only: selection is reported via onNavigate so the parent owns
// routing (kept out of the shell for a clean backend/route swap later).
import { type ReactNode, useState } from 'react';
import { Menu, RotateCcw, X } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { resetComoDemo } from '@/data/storage/resetComoDemo';
import type { PortalNavItem, PortalNavSection } from '@/constants/portalNav';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';
import type { PortalTheme } from '@/theme/portal';

const SIDEBAR_WIDTH = 256;

export type PortalBrand = { title: string; subtitle?: string };

type PortalShellProps = {
  brand: PortalBrand;
  sections: PortalNavSection[];
  activeId: string;
  theme: PortalTheme;
  /** Right cluster of the topbar (language toggle, user chip, etc.). */
  topbarRight?: ReactNode;
  /** Left-of-right status chip (e.g. "PROTECTED WINDOW ACTIVE"). */
  topbarBadge?: ReactNode;
  /** Sidebar footer (e.g. environment status). */
  footer?: ReactNode;
  onNavigate?: (item: PortalNavItem) => void;
  children: ReactNode;
};

export function PortalShell({
  brand,
  sections,
  activeId,
  theme,
  topbarRight,
  topbarBadge,
  footer,
  onNavigate,
  children,
}: PortalShellProps) {
  const { isWideWeb } = useAppLayout();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const copy = useCopy();

  const sidebar = (
    <PortalSidebar
      brand={brand}
      sections={sections}
      activeId={activeId}
      theme={theme}
      footer={footer}
      onSelect={(item) => {
        setDrawerOpen(false);
        onNavigate?.(item);
      }}
      showClose={!isWideWeb}
      onClose={() => setDrawerOpen(false)}
    />
  );

  return (
    <View
      className="h-full min-h-0 w-full flex-1 overflow-hidden"
      style={{ backgroundColor: theme.contentBg, flexDirection: 'row' }}
    >
      {isWideWeb ? <View style={{ width: SIDEBAR_WIDTH }}>{sidebar}</View> : null}

      <View style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <PortalTopbar
          brand={brand}
          theme={theme}
          showMenu={!isWideWeb}
          onMenu={() => setDrawerOpen(true)}
          right={topbarRight}
          badge={topbarBadge}
          insetTop={isWideWeb ? 0 : insets.top}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: isWideWeb ? 24 : 16, paddingBottom: 48 }}
        >
          {children}
        </ScrollView>
      </View>

      {!isWideWeb && drawerOpen ? (
        // Absolute overlay drawer (not RN Modal — Modal is unreliable on Expo Web).
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
        >
          <Pressable
            style={{ flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)' }}
            accessibilityRole="button"
            accessibilityLabel={copy.shellA11yCloseMenu}
            onPress={() => setDrawerOpen(false)}
          >
            <Pressable style={{ width: 288, maxWidth: '85%' }} onPress={() => {}}>
              {sidebar}
            </Pressable>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

type PortalSidebarProps = {
  brand: PortalBrand;
  sections: PortalNavSection[];
  activeId: string;
  theme: PortalTheme;
  footer?: ReactNode;
  onSelect: (item: PortalNavItem) => void;
  showClose?: boolean;
  onClose?: () => void;
};

function PortalSidebar({
  brand,
  sections,
  activeId,
  theme,
  footer,
  onSelect,
  showClose = false,
  onClose,
}: PortalSidebarProps) {
  const copy = useCopy();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.sidebarBg,
        borderRightWidth: 1,
        borderRightColor: theme.sidebarBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: 18,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.sidebarTextActive,
              fontWeight: '800',
              fontSize: 16,
              letterSpacing: 0.4,
            }}
          >
            {brand.title}
          </Text>
          {brand.subtitle ? (
            <Text style={{ color: theme.sidebarTextMuted, fontSize: 12, marginTop: 3 }}>
              {brand.subtitle}
            </Text>
          ) : null}
        </View>
        {showClose ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={copy.shellA11yCloseMenu}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={theme.sidebarTextMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
        {sections.map((section) => (
          <View key={section.id} style={{ marginTop: 10 }}>
            {section.labelKey ? (
              <Text
                accessibilityRole="header"
                style={{
                  color: theme.sidebarTextMuted,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                  paddingHorizontal: 20,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}
              >
                {copy[section.labelKey]}
              </Text>
            ) : null}
            {section.items.map((item) => {
              const active = item.id === activeId;
              const Icon = item.icon;
              const itemLabel = copy[item.labelKey];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onSelect(item)}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={itemLabel}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    marginHorizontal: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: active ? theme.sidebarActiveBg : 'transparent',
                  }}
                >
                  <Icon
                    size={18}
                    color={active ? theme.sidebarTextActive : theme.sidebarTextMuted}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: active ? theme.sidebarTextActive : theme.sidebarText,
                      fontWeight: active ? '700' : '500',
                      fontSize: 14,
                    }}
                  >
                    {itemLabel}
                  </Text>
                  {item.badge != null ? (
                    <View
                      style={{
                        backgroundColor: colors.danger,
                        borderRadius: 999,
                        paddingHorizontal: 7,
                        paddingVertical: 1,
                        minWidth: 20,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                        {item.badge}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {footer ? (
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.sidebarBorder }}>
          {footer}
        </View>
      ) : null}

      {/* Reset the demo to a clean replay (clears the persisted rule change + reloads). */}
      <Pressable
        onPress={() => void resetComoDemo()}
        accessibilityRole="button"
        accessibilityLabel={copy.shellResetDemo}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 20,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: theme.sidebarBorder,
        }}
      >
        <RotateCcw size={14} color={theme.sidebarTextMuted} />
        <Text style={{ color: theme.sidebarTextMuted, fontSize: 12, fontWeight: '600' }}>
          {copy.shellResetDemo}
        </Text>
      </Pressable>
    </View>
  );
}

type PortalTopbarProps = {
  brand: PortalBrand;
  theme: PortalTheme;
  showMenu: boolean;
  onMenu: () => void;
  right?: ReactNode;
  badge?: ReactNode;
  insetTop: number;
};

function PortalTopbar({ brand, theme, showMenu, onMenu, right, badge, insetTop }: PortalTopbarProps) {
  const copy = useCopy();

  return (
    <View
      style={{
        zIndex: 80,
        elevation: 80,
        overflow: 'visible',
        paddingTop: insetTop,
        backgroundColor: theme.topbarBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.topbarBorder,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          minHeight: 60,
          overflow: 'visible',
        }}
      >
        {showMenu ? (
          <Pressable
            onPress={onMenu}
            accessibilityRole="button"
            accessibilityLabel={copy.shellA11yOpenMenu}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Menu size={22} color={colors.text} />
          </Pressable>
        ) : null}
        {showMenu ? (
          <Text accessibilityRole="header" style={{ fontWeight: '800', color: colors.text, fontSize: 15 }} numberOfLines={1}>
            {brand.title}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {badge}
        {right}
      </View>
    </View>
  );
}
