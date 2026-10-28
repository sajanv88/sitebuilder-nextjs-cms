// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

"use client";

import { MoreHorizontalIcon, UserPlusIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  PasswordInput,
  toast,
} from "@nuvui/react";
import { DataTable } from "@nuvui/table";
import { createColumnHelper, useDataTable } from "@nuvui/table/full";
import type { UserRow } from "@sitebuilder/db";
import { PASSWORD_MIN_LENGTH, ROLES, type Role } from "@sitebuilder/schema";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  changeBan,
  changeRole,
  createUser,
  type NewUserState,
  removeUser,
  sendPasswordLink,
  setPassword,
  type UserActionResult,
} from "@/actions/users";
import { useFormatDateTime } from "@/components/date-settings/date-settings";
import "./user-manager.scss";

// The Users screen (design §6): everyone who can sign in, with their role, and what an admin may
// do to each. The server checks every change again, the last-admin rule included.

const ROLE_LABELS: Record<Role, string> = { admin: "Admin", editor: "Editor", author: "Author" };
const ROLE_NOTES: Record<Role, string> = {
  admin: "Everything, including users and settings.",
  editor: "All content, media, menus and the theme.",
  author: "Their own posts and uploads.",
};

function roleLabel(role: string | null): string {
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as Role] : "No role";
}

type Open =
  | { kind: "add" }
  | { kind: "role"; user: UserRow }
  | { kind: "password"; user: UserRow }
  | { kind: "ban"; user: UserRow }
  | { kind: "delete"; user: UserRow }
  | null;

function NewUserForm({
  onSaved,
  canEmail,
}: {
  onSaved: (message: string) => void;
  // Email is set up: the new user can get a link to choose their own password.
  canEmail: boolean;
}) {
  const [invite, setInvite] = useState(canEmail);
  const [state, action, pending] = useActionState(createUser, {
    result: "idle",
    values: { name: "", email: "", role: "author" },
  } satisfies NewUserState);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.result === "saved" && state.message && state.savedAt) onSaved(state.message);
  }, [state.result, state.message, state.savedAt, onSaved]);

  return (
    <form action={action} className="user-manager__form" noValidate>
      {state.result === "failed" ? (
        <Alert intent="danger" role="alert">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Name</FieldLabel>
        <FieldControl>
          <Input name="name" autoComplete="off" defaultValue={state.values.name} />
        </FieldControl>
        <FieldError>{errors.name}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="off" defaultValue={state.values.email} />
        </FieldControl>
        <FieldError>{errors.email}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Role</FieldLabel>
        <FieldControl>
          <NativeSelect name="role" defaultValue={state.values.role}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}: {ROLE_NOTES[role]}
              </option>
            ))}
          </NativeSelect>
        </FieldControl>
        <FieldError>{errors.role}</FieldError>
      </Field>
      {canEmail ? (
        <Field orientation="horizontal">
          <FieldControl>
            <Checkbox
              name="invite"
              checked={invite}
              onCheckedChange={(checked) => setInvite(checked === true)}
            />
          </FieldControl>
          <FieldLabel>Email them a link to choose their password</FieldLabel>
          <FieldDescription>It works once, for a day.</FieldDescription>
        </Field>
      ) : null}
      {invite ? null : (
        <Field required>
          <FieldLabel>Password</FieldLabel>
          <FieldControl>
            <PasswordInput name="password" autoComplete="new-password" />
          </FieldControl>
          <FieldDescription>
            At least {PASSWORD_MIN_LENGTH} characters. Give it to them yourself.
          </FieldDescription>
          <FieldError>{errors.password}</FieldError>
        </Field>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          Add user
        </Button>
      </DialogFooter>
    </form>
  );
}

const helper = createColumnHelper<UserRow>();

export function UserManager({
  users,
  viewerId,
  canEmail,
}: {
  users: UserRow[];
  viewerId: string;
  // Email is set up (Settings → Email or the environment).
  canEmail: boolean;
}) {
  const formatDateTime = useFormatDateTime();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const others = users.filter((user) => open && "user" in open && user.id !== open.user.id);

  const close = useCallback(() => {
    setOpen(null);
    setProblem("");
  }, []);

  // Runs a change; a refusal stays in the dialog, a success closes it and says so.
  const run = useCallback(
    (change: () => Promise<UserActionResult>) => {
      setProblem("");
      startTransition(async () => {
        const result = await change();
        if (!result.ok) {
          if (open) setProblem(result.error);
          else toast(result.error, { intent: "danger" });
          return;
        }
        close();
        toast(result.message, { intent: "success" });
        router.refresh();
      });
    },
    [open, router, close],
  );

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: "Name",
          enableHiding: false,
          cell: ({ row }) => (
            <span className="user-manager__who">
              <span className="user-manager__name">
                {row.original.name}
                {row.original.id === viewerId ? " (you)" : ""}
              </span>
              <span className="user-manager__email">{row.original.email}</span>
            </span>
          ),
        }),
        helper.accessor((user) => roleLabel(user.role), { id: "role", header: "Role" }),
        helper.accessor((user) => (user.banned ? "Banned" : "Active"), {
          id: "status",
          header: "Status",
          cell: ({ row }) =>
            row.original.banned ? (
              <Badge intent="danger" variant="outline">
                Banned
              </Badge>
            ) : (
              <Badge intent="success" variant="outline">
                Active
              </Badge>
            ),
        }),
        helper.accessor("entryCount", { header: "Entries", meta: { align: "end" } }),
        helper.accessor("createdAt", {
          header: "Added",
          cell: (cell) => formatDateTime(cell.getValue()),
        }),
        helper.display({
          id: "actions",
          header: "Actions",
          enableHiding: false,
          cell: ({ row }) => {
            const user = row.original;
            const self = user.id === viewerId;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    intent="ghost"
                    size="sm"
                    className="user-manager__more"
                    aria-label={`Actions for ${user.name}`}
                  >
                    <MoreHorizontalIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setOpen({ kind: "role", user })}>
                    Change role
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setOpen({ kind: "password", user })}>
                    Set a new password
                  </DropdownMenuItem>
                  {canEmail ? (
                    <DropdownMenuItem
                      onSelect={() => run(() => sendPasswordLink({ userId: user.id }))}
                    >
                      Email a password link
                    </DropdownMenuItem>
                  ) : null}
                  {self ? null : (
                    <>
                      <DropdownMenuSeparator />
                      {user.banned ? (
                        <DropdownMenuItem
                          onSelect={() => run(() => changeBan({ userId: user.id, banned: false }))}
                        >
                          Unban
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setOpen({ kind: "ban", user })}>
                          Ban
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        intent="danger"
                        onSelect={() => setOpen({ kind: "delete", user })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ]),
    [viewerId, run, formatDateTime, canEmail],
  );

  const table = useDataTable({
    columns,
    data: users,
    getRowId: (user) => user.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: "name", desc: false }],
    },
  });

  // The menu that opened a dialog is gone when it closes; the Add button takes the focus.
  const returnFocus = (event: Event) => {
    event.preventDefault();
    addButton.current?.focus();
  };

  return (
    <div className="user-manager">
      <div className="user-manager__bar">
        <Button ref={addButton} onClick={() => setOpen({ kind: "add" })}>
          <UserPlusIcon size={16} />
          Add user
        </Button>
      </div>

      <DataTable
        table={table}
        aria-label="Users"
        rowHeader="name"
        loading={pending}
        pageSizes={[20, 50, 100]}
      />

      <Dialog open={open?.kind === "add"} onOpenChange={(next) => !next && close()}>
        <DialogContent size="sm" onCloseAutoFocus={returnFocus}>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            They sign in at /admin with this email and password.
          </DialogDescription>
          {open?.kind === "add" ? (
            <NewUserForm
              canEmail={canEmail}
              onSaved={(message) => {
                close();
                toast(message, { intent: "success", duration: 10_000 });
                router.refresh();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "role"} onOpenChange={(next) => !next && close()}>
        <DialogContent size="sm" onCloseAutoFocus={returnFocus}>
          {open?.kind === "role" ? (
            <form
              className="user-manager__form"
              onSubmit={(event) => {
                event.preventDefault();
                const role = new FormData(event.currentTarget).get("role");
                run(() => changeRole({ userId: open.user.id, role }));
              }}
            >
              <DialogTitle>Change {open.user.name}'s role</DialogTitle>
              <DialogDescription>It applies from their next click.</DialogDescription>
              {problem ? (
                <Alert intent="danger" role="alert">
                  <AlertDescription>{problem}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel>Role</FieldLabel>
                <FieldControl>
                  <NativeSelect name="role" defaultValue={open.user.role ?? "author"}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}: {ROLE_NOTES[role]}
                      </option>
                    ))}
                  </NativeSelect>
                </FieldControl>
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  Change role
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={open?.kind === "password"} onOpenChange={(next) => !next && close()}>
        <DialogContent size="sm" onCloseAutoFocus={returnFocus}>
          {open?.kind === "password" ? (
            <form
              className="user-manager__form"
              onSubmit={(event) => {
                event.preventDefault();
                const password = new FormData(event.currentTarget).get("password");
                run(() => setPassword({ userId: open.user.id, password }));
              }}
            >
              <DialogTitle>Set a new password for {open.user.name}</DialogTitle>
              <DialogDescription>
                Tell them the new one yourself, or email them a link from their row instead. Their
                old password stops working.
              </DialogDescription>
              <Field required>
                <FieldLabel>New password</FieldLabel>
                <FieldControl>
                  <PasswordInput name="password" autoComplete="new-password" />
                </FieldControl>
                <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
                <FieldError>{problem}</FieldError>
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={pending} aria-busy={pending}>
                  Set password
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={open?.kind === "ban"} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent size="sm" onCloseAutoFocus={returnFocus}>
          <AlertDialogTitle>Ban {open?.kind === "ban" ? open.user.name : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            They're signed out at once and can't sign in until unbanned. Their content stays.
          </AlertDialogDescription>
          {problem ? (
            <p role="alert" className="user-manager__problem">
              {problem}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (open?.kind === "ban")
                  run(() => changeBan({ userId: open.user.id, banned: true }));
              }}
            >
              Ban
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Someone with content needs a choice of who gets it, which is a form: a dialog. With
          nothing to hand over, it's a plain confirmation. */}
      <Dialog
        open={open?.kind === "delete" && open.user.entryCount > 0}
        onOpenChange={(next) => !next && close()}
      >
        <DialogContent size="sm" onCloseAutoFocus={returnFocus}>
          {open?.kind === "delete" ? (
            <form
              className="user-manager__form"
              onSubmit={(event) => {
                event.preventDefault();
                const reassignTo = new FormData(event.currentTarget).get("reassignTo");
                run(() => removeUser({ userId: open.user.id, reassignTo }));
              }}
            >
              <DialogTitle>Delete {open.user.name}?</DialogTitle>
              <DialogDescription>
                Their {open.user.entryCount === 1 ? "entry" : `${open.user.entryCount} entries`},
                revisions and uploads go to the person you choose. This can't be undone.
              </DialogDescription>
              {problem ? (
                <Alert intent="danger" role="alert">
                  <AlertDescription>{problem}</AlertDescription>
                </Alert>
              ) : null}
              <Field required>
                <FieldLabel>Give their content to</FieldLabel>
                <FieldControl>
                  <NativeSelect name="reassignTo" defaultValue={viewerId}>
                    {others.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </NativeSelect>
                </FieldControl>
              </Field>
              <DialogFooter>
                <Button type="submit" intent="danger" disabled={pending} aria-busy={pending}>
                  Delete user
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={open?.kind === "delete" && open.user.entryCount === 0}
        onOpenChange={(next) => !next && close()}
      >
        <AlertDialogContent size="sm" onCloseAutoFocus={returnFocus}>
          <AlertDialogTitle>
            Delete {open?.kind === "delete" ? open.user.name : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            They have no content. This can't be undone.
          </AlertDialogDescription>
          {problem ? (
            <p role="alert" className="user-manager__problem">
              {problem}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              intent="danger"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (open?.kind === "delete")
                  run(() => removeUser({ userId: open.user.id, reassignTo: "" }));
              }}
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
