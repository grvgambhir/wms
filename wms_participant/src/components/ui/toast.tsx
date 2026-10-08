import { CheckCircle2, CircleAlert } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastState = ToastInput & {
  id: number;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50',
  error: 'border-destructive/30 bg-destructive/10',
  info: 'border-primary/20 bg-white',
};

const VARIANT_ICON: Record<ToastVariant, string> = {
  success: '#16A34A',
  error: '#DC2626',
  info: '#1E3A8A',
};

/** Cross-platform toast host — Expo Web + iOS/Android. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const hideToast = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    ({ title, description, variant = 'success', durationMs = 3200 }: ToastInput) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);

      idRef.current += 1;
      setToast({ id: idRef.current, title, description, variant, durationMs });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

      hideTimer.current = setTimeout(hideToast, durationMs);
    },
    [hideToast, opacity],
  );

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  const variant = toast?.variant ?? 'success';
  const Icon = variant === 'error' ? CircleAlert : CheckCircle2;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 z-[9999] items-center px-4"
          style={{ bottom: Math.max(insets.bottom, 16) + (Platform.OS === 'web' ? 72 : 8) }}>
          <Animated.View style={{ opacity, width: '100%', maxWidth: 420 }}>
            <View
              className={cn(
                'flex-row items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg shadow-black/10',
                VARIANT_STYLES[variant],
              )}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite">
              <Icon size={20} color={VARIANT_ICON[variant]} style={{ marginTop: 2 }} />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold text-foreground">{toast.title}</Text>
                {toast.description ? (
                  <Text className="text-sm leading-5 text-muted-foreground">{toast.description}</Text>
                ) : null}
              </View>
            </View>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
