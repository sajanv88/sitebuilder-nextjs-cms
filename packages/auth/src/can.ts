// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 Sajankumar Vijayan

import { permissions, type ResourceType, type Role, type RolePermissions } from "./permissions";

// The one permission check (design §6.4). Every server action, route handler and admin page
// calls it before doing anything; hiding a button is never the check.

export interface Actor {
  id: string;
  role: Role;
}

type Owned = "post" | "page" | "media";

export type Resource = { type: Owned; ownerId: string } | { type: Exclude<ResourceType, Owned> };

// "post.update", "media.delete", "user.setRole", ... The `xOwn` grants are never asked for
// directly: asking for `x` on an owned resource checks them.
type BaseVerb<V extends string> = V extends `${string}Own` ? never : V;
export type Action = {
  [R in ResourceType]: `${R}.${BaseVerb<NonNullable<RolePermissions[R]>[number]>}`;
}[ResourceType];

function grantsOf(role: Role, type: ResourceType): readonly string[] {
  const table: RolePermissions = permissions[role];
  return table[type] ?? [];
}

function split(action: Action): [ResourceType, string] {
  const dot = action.indexOf(".");
  return [action.slice(0, dot) as ResourceType, action.slice(dot + 1)];
}

// True when the actor's role has the action, or has `actionOwn` and owns the resource.
export function can(actor: Actor, action: Action, resource?: Resource): boolean {
  const [type, verb] = split(action);
  if (resource && resource.type !== type) return false;
  const grants = grantsOf(actor.role, type);
  if (grants.includes(verb)) return true;
  return (
    grants.includes(`${verb}Own`) &&
    resource !== undefined &&
    "ownerId" in resource &&
    resource.ownerId === actor.id
  );
}

// True when the actor may do the action on at least their own items: for showing a screen or a
// list that is then filtered to what they own (an author's Posts screen lists their own posts).
export function canSome(actor: Actor, action: Action): boolean {
  const [type, verb] = split(action);
  const grants = grantsOf(actor.role, type);
  return grants.includes(verb) || grants.includes(`${verb}Own`);
}
