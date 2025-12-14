import type { Model, Document, FilterQuery, UpdateQuery } from "mongoose";

/**
 * Typsicherer findOne Wrapper für Mongoose Models
 * Behält Type-Safety und ermöglicht korrektes Typing
 */
export async function findOneDoc<T extends Document>(model: Model<T>, filter: FilterQuery<T>): Promise<T | null> {
  return (model as any).findOne(filter);
}

/**
 * Typsicherer create Wrapper für Mongoose Models
 * Gibt das neu erstellte Dokument mit korrektem Typ zurück
 */
export async function createDoc<T extends Document>(model: Model<T>, data: Record<string, any>): Promise<T> {
  return (model as any).create(data);
}

/**
 * Typsicherer findOneAndUpdate Wrapper für Mongoose Models
 * Unterstützt Upsert und gibt das aktualisierte Dokument zurück
 */
export async function findOneAndUpdateDoc<T extends Document>(
  model: Model<T>,
  filter: FilterQuery<T>,
  update: UpdateQuery<T>,
  options?: { upsert?: boolean; new?: boolean }
): Promise<T | null> {
  return (model as any).findOneAndUpdate(filter, update, options);
}
