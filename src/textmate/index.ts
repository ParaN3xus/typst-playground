import * as vsctm from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import * as monaco from 'monaco-editor';
import wasmURL from 'vscode-oniguruma/release/onig.wasm?url';
import { IColorTheme, TMToMonacoToken } from './tm-to-monaco-token';

export {
  convertTheme,
  type IVScodeTheme,
  type TokenColor,
} from './theme-converter';

const wasmPromise = fetch(wasmURL)
  .then((response) => response.arrayBuffer())
  .then((buffer) => loadWASM({ data: buffer }))
  .catch((error) => console.error('Failed to load `onig.wasm`:', error));

const scopeUrlMap: Record<string, string> = {
  'source.typst':
    './typst.tmLanguage.json',
};

const registry = new vsctm.Registry({
  onigLib: wasmPromise.then(() => {
    return {
      createOnigScanner: (sources) => new OnigScanner(sources),
      createOnigString: (str) => new OnigString(str),
    };
  }),
  loadGrammar(scopeName) {
    function fetchGrammar(path: string) {
      return fetch(path).then((response) => response.text());
    }

    const url = scopeUrlMap[scopeName];
    if (url) {
      return fetchGrammar(url).then((grammar) => JSON.parse(grammar));
    }

    return Promise.reject(
      new Error(`No grammar found for scope: ${scopeName}`)
    );
  },
});

async function createTokensProvider(
  scopeName: string,
  editor?:
    | (monaco.editor.IStandaloneCodeEditor & { _themeService?: any })
    | undefined
): Promise<monaco.languages.TokensProvider> {
  let colorTheme: IColorTheme | undefined = undefined;

  if (editor) {
    const rules: monaco.editor.ITokenThemeRule[] =
      editor._themeService._theme.themeData.rules;
    colorTheme = {
      tokenColors: rules.map((rule) => ({
        scope: rule.token,
        settings: {
          foreground: rule.foreground,
          background: rule.background,
          fontStyle: rule.fontStyle,
        },
      })),
    };

    editor._themeService.onDidColorThemeChange((theme) => {
      const rules: monaco.editor.ITokenThemeRule[] = theme.themeData.rules;
      colorTheme = {
        tokenColors: rules.map((rule) => ({
          scope: rule.token,
          settings: {
            foreground: rule.foreground,
            background: rule.background,
            fontStyle: rule.fontStyle,
          },
        })),
      };
    });
  }

  const grammar = await registry.loadGrammar(scopeName);

  if (!grammar) {
    throw new Error('Failed to load grammar');
  }

  const result: monaco.languages.TokensProvider = {
    getInitialState() {
      return vsctm.INITIAL;
    },
    tokenize(line, state: vsctm.StateStack) {
      const lineTokens = grammar.tokenizeLine(line, state);
      const tokens: monaco.languages.IToken[] = [];
      for (const token of lineTokens.tokens) {
        tokens.push({
          startIndex: token.startIndex,
          // Monaco doesn't support an array of scopes
          scopes: colorTheme
            ? TMToMonacoToken(colorTheme, token.scopes)
            : token.scopes[token.scopes.length - 1],
        });
      }
      return { tokens, endState: lineTokens.ruleStack };
    },
  };

  return result;
}

class TokensProviderCache {
  private cache: Record<string, monaco.languages.TokensProvider> = {};

  constructor(
    private editor?: monaco.editor.IStandaloneCodeEditor | undefined
  ) { }

  async getTokensProvider(
    scopeName: string
  ): Promise<monaco.languages.TokensProvider> {
    if (!this.cache[scopeName]) {
      this.cache[scopeName] = await createTokensProvider(
        scopeName,
        this.editor
      );
    }

    return this.cache[scopeName];
  }
}

export { TokensProviderCache };
