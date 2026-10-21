// valibot schemas and types shared by both zones and packages/db. Depends on valibot only.

export {
  Email,
  NewAdminInput,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  Password,
  PersonName,
  SignInInput,
} from "./accounts";
export {
  type Block,
  type BlockList,
  BlockListSchema,
  type BlockRule,
  type BlockRules,
  BlockSchema,
  BlockType,
  type ContainerRule,
  type ContentIssue,
  MAX_BLOCKS,
  MAX_DEPTH,
} from "./blocks";
export { type Env, type EnvResult, EnvSchema, parseEnv } from "./env";
export {
  MENU_LOCATIONS,
  type Menu,
  type MenuItem,
  MenuItemSchema,
  MenuLocation,
  MenuSchema,
} from "./menu";
export {
  defaultSettings,
  ReadingSettings,
  type SettingsKey,
  SettingsSchemas,
  type SettingsValue,
  SiteSettings,
  ThemeSettings,
  TokenName,
  TokenValue,
} from "./settings";
export { LinkTarget, NodeId, Url, Uuid } from "./shared";
export { type BlockListResult, validateBlockList } from "./validate-block-list";
