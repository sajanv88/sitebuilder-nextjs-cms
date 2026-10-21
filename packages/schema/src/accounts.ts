import * as v from "valibot";

// Account input shared by /setup, the create-admin script and Better Auth's own limits
// (design §6.3: passwords are 12 to 128 characters).

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const Email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254));

export const Password = v.pipe(
  v.string(),
  v.minLength(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`),
  v.maxLength(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
);

export const PersonName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Enter a name"),
  v.maxLength(200),
);

export const NewAdminInput = v.object({ name: PersonName, email: Email, password: Password });
export type NewAdminInput = v.InferOutput<typeof NewAdminInput>;

export const SignInInput = v.object({
  email: Email,
  password: v.pipe(
    v.string(),
    v.minLength(1, "Enter your password"),
    v.maxLength(PASSWORD_MAX_LENGTH),
  ),
});
export type SignInInput = v.InferOutput<typeof SignInInput>;
