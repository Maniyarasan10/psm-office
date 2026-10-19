import React, { createContext, useContext } from 'react';
import { Theme } from '../theme/types';
import { colors, typography, spacing, radius, shadows, elevation, iconSizes, componentSizes } from '../theme';

const theme: Theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  elevation,
  iconSizes,
  componentSizes,
};

const ThemeContext = createContext<Theme>(theme);

export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => {
  return useContext(ThemeContext);
};

