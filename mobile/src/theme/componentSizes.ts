export const componentSizes = {
  button: {
    sm: { height: 36, paddingHorizontal: 14 },
    md: { height: 44, paddingHorizontal: 16 },
    lg: { height: 50, paddingHorizontal: 20 },
  },
  input: {
    sm: { height: 40, paddingHorizontal: 12, fontSize: 13 },
    md: { height: 44, paddingHorizontal: 14, fontSize: 15 },
    lg: { height: 48, paddingHorizontal: 16, fontSize: 16 },
  },
  avatar: {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
  },
} as const;
