import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { useTheme, type ThemeColors } from "@/src/theme";
import type { AssistantState } from "@/src/types";

type Cfg = { spin: number; scale: number; beat: number; glow: number; tone: keyof ThemeColors; amp: number };
const CFG: Record<AssistantState, Cfg> = {
  idle: { spin: 26000, scale: 1.03, beat: 2800, glow: 0.45, tone: "accent", amp: 1 },
  wake: { spin: 8000, scale: 1.12, beat: 380, glow: 1, tone: "accent", amp: 1.3 },
  listening: { spin: 14000, scale: 1.07, beat: 620, glow: 0.8, tone: "accent", amp: 1.2 },
  processing: { spin: 3600, scale: 0.95, beat: 900, glow: 0.6, tone: "brandPrimary", amp: 0.7 },
  executing: { spin: 6000, scale: 1.04, beat: 1000, glow: 0.65, tone: "warning", amp: 0.9 },
  speaking: { spin: 11000, scale: 1.09, beat: 420, glow: 0.9, tone: "accent", amp: 1.15 },
  error: { spin: 60000, scale: 1, beat: 3000, glow: 0.12, tone: "error", amp: 0.5 },
};

function ribbon(size: number, i: number, lobes: number, phase: number) {
  const c = size / 2;
  const r = size * 0.3 + i * 0.9;
  const amp = size * 0.055;
  let d = "";
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const rr = r + amp * Math.sin(lobes * a + phase + i * 0.11) + amp * 0.45 * Math.sin((lobes + 2) * a - phase * 1.6 - i * 0.07);
    d += `${k === 0 ? "M" : "L"}${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

function RibbonLayer({ size, color, lobes, phase, opacity }: { size: number; color: string; lobes: number; phase: number; opacity: number }) {
  const paths = useMemo(() => Array.from({ length: 9 }, (_, i) => ribbon(size, i, lobes, phase)), [size, lobes, phase]);
  return (
    <Svg width={size} height={size}>
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeOpacity={opacity * (1 - i * 0.07)} strokeWidth={0.9} fill="none" />
      ))}
    </Svg>
  );
}

/** The assistant's identity: interlaced line ribbons that change tempo, colour and breath per state. */
export function VoiceOrb({ state, size = 240, testID }: { state: AssistantState; size?: number; testID?: string }) {
  const { colors } = useTheme();
  const cfg = CFG[state];
  const rotA = useSharedValue(0);
  const rotB = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(cfg.glow);

  useEffect(() => {
    cancelAnimation(rotA);
    cancelAnimation(rotB);
    cancelAnimation(scale);
    const lin = { easing: Easing.linear };
    rotA.value = withRepeat(withTiming(rotA.value + 360, { duration: cfg.spin, ...lin }), -1, false);
    rotB.value = withRepeat(withTiming(rotB.value - 360, { duration: cfg.spin * 1.35, ...lin }), -1, false);
    const ease = { duration: cfg.beat, easing: Easing.inOut(Easing.sin) };
    scale.value = withRepeat(withSequence(withTiming(cfg.scale, ease), withTiming(state === "processing" ? 1 : 0.985, ease)), -1, true);
    glow.value = withTiming(cfg.glow, { duration: 500 });
  }, [state, cfg, rotA, rotB, scale, glow]);

  const aStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotA.value}deg` }, { scale: scale.value }] }));
  const bStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotB.value}deg` }, { scale: 2 - scale.value * 0.98 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 0.9 + scale.value * 0.1 }] }));

  const tone = colors[cfg.tone];
  const base = state === "error" ? colors.muted : colors.brandPrimary;
  const g = size * 1.5;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} testID={testID} accessibilityLabel={`Assistant ${state}`}>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, glowStyle]} pointerEvents="none">
        <Svg width={g} height={g}>
          <Defs>
            <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tone} stopOpacity={0.32} />
              <Stop offset="0.45" stopColor={colors.glow} stopOpacity={0.22} />
              <Stop offset="1" stopColor={colors.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={g / 2} cy={g / 2} r={g / 2} fill="url(#orbGlow)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, aStyle]}>
        <RibbonLayer size={size} color={base} lobes={3} phase={0} opacity={0.85} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, bStyle]}>
        <RibbonLayer size={size} color={tone} lobes={4} phase={1.3} opacity={0.75} />
      </Animated.View>
    </View>
  );
}
