/**
 * Prettier config — pinned to the style this repo ALREADY uses.
 *
 * Why this file exists: with no config, `npx prettier --write .` applies
 * Prettier's defaults (semicolons everywhere, double quotes, 80 columns) and
 * rewrites essentially the whole codebase against its own conventions. That
 * happened once, to one file, and produced a ~180-line diff on a change that
 * touched about twenty. These settings were derived by measuring the existing
 * source, not chosen from taste, so the formatter now agrees with the code
 * instead of fighting it.
 *
 * Measured, not guessed:
 *   - semicolons: `src/**` has exactly ONE file that terminates statements
 *     with `;` (src/types.ts, 35 lines). Everything else in src is
 *     semicolon-free. `scripts/*.mjs` is the opposite — 416 semicolon-
 *     terminated lines. Both dialects are pinned below rather than
 *     normalised, because normalising means reformatting.
 *   - printWidth 100: p95 line length in src is 87, p99 is 98. Swept
 *     98/100/102/104/106/110/120 against `--check`; everything from 98 to 106
 *     lands within one file of the minimum, and 110+ is clearly worse because
 *     wider values make Prettier JOIN lines the author deliberately wrapped.
 *     100 is the round number in the middle of that flat optimum.
 *   - single quotes, 2-space indent, trailing commas everywhere, always-
 *     parenthesised arrow params, double quotes in JSX: all read off the
 *     existing source.
 *
 * A CAVEAT worth knowing before running --write: this config makes Prettier
 * agree with the repo's *style*, but it cannot make `--check` pass. The code
 * was hand-formatted and Prettier is deterministic — it has exactly one
 * output per input, and hand-written code essentially never matches it
 * byte-for-byte. The remaining differences are line-wrapping choices, which
 * Prettier has no option to preserve. Concretely, on the current tree a bare
 * `--write` touches ~1,300 lines with this config versus ~6,000 without it.
 * So: safe to adopt deliberately in one formatting commit, not something to
 * run casually mid-change.
 */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,
  jsxSingleQuote: false,
  // The repo is checked out with core.autocrlf on Windows, so working-copy
  // files have CRLF while git stores LF. 'auto' keeps whatever the file
  // already uses instead of flagging every file on this machine.
  endOfLine: 'auto',
  overrides: [
    {
      // Build/data scripts are written in semicolon style.
      files: 'scripts/**/*.mjs',
      options: { semi: true },
    },
    {
      // The one semicolon-style file under src/. Pinned rather than
      // converted, so adopting this config is not itself a code change.
      files: 'src/types.ts',
      options: { semi: true },
    },
  ],
}
