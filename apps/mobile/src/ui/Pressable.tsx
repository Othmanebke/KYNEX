import { useState } from "react";
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";
import { HIT } from "./tokens";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export interface PressScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Échelle au toucher ; 0.97 par défaut. */
  pressedScale?: number;
}

/**
 * Retour visuel au toucher (pas au relâchement) : léger enfoncement en 120 ms.
 * Transition CSS Reanimated : tourne sur le thread UI, aucun worklet nécessaire.
 * Réduction des animations : on garde une baisse d'opacité, sans échelle.
 */
export function PressScale({ style, pressedScale = 0.97, children, onPressIn, onPressOut, disabled, ...rest }: PressScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const active = pressed && !disabled;
  return (
    <RNPressable
      {...rest}
      disabled={disabled}
      hitSlop={rest.hitSlop ?? 4}
      pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={{ minHeight: HIT, justifyContent: "center" }}
    >
      {(state) => (
        <Animated.View
          style={[
            style,
            {
              transform: [{ scale: active && !reduced ? pressedScale : 1 }],
              opacity: active && reduced ? 0.7 : disabled ? 0.45 : 1,
              transitionProperty: ["transform", "opacity"],
              transitionDuration: active ? 100 : 160,
              transitionTimingFunction: EASE_OUT,
            },
          ]}
        >
          {typeof children === "function" ? children(state) : children}
        </Animated.View>
      )}
    </RNPressable>
  );
}
