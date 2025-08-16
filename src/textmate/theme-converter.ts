import type { editor } from 'monaco-editor';

interface IVScodeTheme {
  $schema: string;
  name?: string | undefined;
  include?: string | undefined;
  type: ThemeType | string;
  tokenColors: TokenColor[];
  colors?:
    | {
        [name: string]: string;
      }
    | undefined;
}

interface TokenColor {
  name?: string;
  scope: string[] | string;
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: string;
  };
}

type ThemeType = 'light' | 'dark' | 'hcLight' | 'hcDark';

function convertTheme(theme: IVScodeTheme): editor.IStandaloneThemeData {
  const rules = [];
  for (const rule of theme.tokenColors) {
    if (typeof rule.scope === 'string') {
      rules.push({
        token: rule.scope,
        foreground: rule.settings.foreground,
      });
    } else {
      for (const scope of rule.scope) {
        rules.push({
          token: scope,
          foreground: rule.settings.foreground,
        });
      }
    }
  }

  return {
    base:
      theme.type === 'light'
        ? 'vs'
        : theme.type === 'hcLight'
        ? 'hc-light'
        : theme.type === 'hcDark'
        ? 'hc-black'
        : 'vs-dark',
    inherit: false,
    rules,
    colors: theme.colors || {},
  };
}

export { convertTheme };
export type { IVScodeTheme, TokenColor };
