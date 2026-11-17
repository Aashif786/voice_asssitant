import React, { type ReactNode } from "react";
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  ScrollView,
  Platform,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
} from "react-native";

/**
 * Universal safe keyboard provider for Expo Go and bare React Native.
 * Prevents native module linking errors in Expo Go where react-native-keyboard-controller is unavailable.
 */
export function KeyboardProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps) {
  const { behavior, style, children, ...rest } = props;
  return (
    <RNKeyboardAvoidingView
      behavior={behavior || (Platform.OS === "ios" ? "padding" : "height")}
      style={style}
      {...rest}
    >
      {children}
    </RNKeyboardAvoidingView>
  );
}

export function KeyboardAwareScrollView(props: ScrollViewProps & { bottomOffset?: number }) {
  const { bottomOffset, keyboardShouldPersistTaps = "handled", ...rest } = props;
  return <ScrollView keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...rest} />;
}
