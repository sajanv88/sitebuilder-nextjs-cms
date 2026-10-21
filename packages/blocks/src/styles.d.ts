// Each block imports its own stylesheet; the app that draws it (Next.js) compiles the SCSS.
// The apps get this from next-env.d.ts; this package type-checks on its own.
declare module "*.scss";
