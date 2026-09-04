import { randomUUID } from 'node:crypto';

declare const sessionIdBrand: unique symbol;
declare const turnIdBrand: unique symbol;
declare const stepIdBrand: unique symbol;
declare const sessionPathBrand: unique symbol;

export type SessionId = string & { readonly [sessionIdBrand]: never };
export type TurnId = string & { readonly [turnIdBrand]: never };
export type StepId = string & { readonly [stepIdBrand]: never };
export type SessionPath = string & { readonly [sessionPathBrand]: never };

export const asSessionId = (value: string): SessionId => value as SessionId;
export const asTurnId = (value: string): TurnId => value as TurnId;
export const asStepId = (value: string): StepId => value as StepId;
export const asSessionPath = (value: string): SessionPath => value as SessionPath;

export const createSessionId = (): SessionId => asSessionId(`session_${randomUUID()}`);
export const createTurnId = (): TurnId => asTurnId(`turn_${randomUUID()}`);
export const createStepId = (): StepId => asStepId(`step_${randomUUID()}`);

