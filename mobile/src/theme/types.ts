import { colors } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';
import { elevation } from './elevation';
import { iconSizes } from './iconSizes';
import { componentSizes } from './componentSizes';

export type ThemeColors = typeof colors;
export type ThemeTypography = typeof typography;
export type ThemeSpacing = typeof spacing;
export type ThemeRadius = typeof radius;
export type ThemeShadows = typeof shadows;
export type ThemeElevation = typeof elevation;
export type ThemeIconSizes = typeof iconSizes;
export type ThemeComponentSizes = typeof componentSizes;

export interface Theme {
  colors: ThemeColors;
  typography: ThemeTypography;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  shadows: ThemeShadows;
  elevation: ThemeElevation;
  iconSizes: ThemeIconSizes;
  componentSizes: ThemeComponentSizes;
}
