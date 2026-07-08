import type { DbSchema, TableSchema } from "./erStore";
import type { ColumnInfo, ForeignKeyInfo } from "../../shared/types";

export interface SchemaDiff {
  tablesToCreate: TableSchema[];
  tablesToDrop: string[];
  tablesToAlter: {
    tableName: string;
    columnsToAdd: ColumnInfo[];
    columnsToDrop: string[];
    columnsToModify: { columnName: string; from: ColumnInfo; to: ColumnInfo }[];
    foreignKeysToAdd: ForeignKeyInfo[];
    foreignKeysToDrop: string[];
  }[];
}

export function generateDiff(initial: DbSchema | null, current: DbSchema | null): SchemaDiff {
  const diff: SchemaDiff = {
    tablesToCreate: [],
    tablesToDrop: [],
    tablesToAlter: [],
  };

  if (!initial || !current) return diff;

  const initialTables = initial.tables;
  const currentTables = current.tables;

  // 1. Find tables to create
  for (const [name, table] of Object.entries(currentTables)) {
    if (!initialTables[name]) {
      diff.tablesToCreate.push(table);
    }
  }

  // 2. Find tables to drop
  for (const name of Object.keys(initialTables)) {
    if (!currentTables[name]) {
      diff.tablesToDrop.push(name);
    }
  }

  // 3. Find tables to alter
  for (const [name, currentTable] of Object.entries(currentTables)) {
    const initialTable = initialTables[name];
    if (initialTable) {
      const columnsToAdd: ColumnInfo[] = [];
      const columnsToDrop: string[] = [];
      const columnsToModify: { columnName: string; from: ColumnInfo; to: ColumnInfo }[] = [];
      
      const foreignKeysToAdd: ForeignKeyInfo[] = [];
      const foreignKeysToDrop: string[] = [];

      // Check columns
      const initialCols = new Map(initialTable.columns.map(c => [c.name, c]));
      const currentCols = new Map(currentTable.columns.map(c => [c.name, c]));

      // Columns to add
      for (const col of currentTable.columns) {
        if (!initialCols.has(col.name)) {
          columnsToAdd.push(col);
        }
      }

      // Columns to drop
      for (const col of initialTable.columns) {
        if (!currentCols.has(col.name)) {
          columnsToDrop.push(col.name);
        }
      }

      // Columns to modify
      for (const currentCol of currentTable.columns) {
        const initialCol = initialCols.get(currentCol.name);
        if (initialCol) {
          const typeChanged = initialCol.data_type.toLowerCase() !== currentCol.data_type.toLowerCase();
          const nullChanged = initialCol.nullable !== currentCol.nullable;
          const pkChanged = initialCol.is_pk !== currentCol.is_pk;

          if (typeChanged || nullChanged || pkChanged) {
            columnsToModify.push({
              columnName: currentCol.name,
              from: initialCol,
              to: currentCol,
            });
          }
        }
      }

      // Check foreign keys
      const initialFks = new Map(initialTable.foreignKeys.map(fk => [fk.name || `fk_${name}_${fk.columns}`, fk]));
      const currentFks = new Map(currentTable.foreignKeys.map(fk => [fk.name || `fk_${name}_${fk.columns}`, fk]));

      // FKs to add
      for (const [fkId, fk] of currentFks.entries()) {
        if (!initialFks.has(fkId)) {
          foreignKeysToAdd.push(fk);
        } else {
          // Check if properties of foreign key changed (referenced table, referenced columns, rules)
          const initialFk = initialFks.get(fkId)!;
          if (
            initialFk.referenced_table !== fk.referenced_table ||
            initialFk.referenced_columns !== fk.referenced_columns ||
            initialFk.on_update !== fk.on_update ||
            initialFk.on_delete !== fk.on_delete
          ) {
            foreignKeysToDrop.push(fkId);
            foreignKeysToAdd.push(fk);
          }
        }
      }

      // FKs to drop
      for (const fkId of initialFks.keys()) {
        if (!currentFks.has(fkId)) {
          foreignKeysToDrop.push(fkId);
        }
      }

      if (
        columnsToAdd.length > 0 ||
        columnsToDrop.length > 0 ||
        columnsToModify.length > 0 ||
        foreignKeysToAdd.length > 0 ||
        foreignKeysToDrop.length > 0
      ) {
        diff.tablesToAlter.push({
          tableName: name,
          columnsToAdd,
          columnsToDrop,
          columnsToModify,
          foreignKeysToAdd,
          foreignKeysToDrop,
        });
      }
    }
  }

  return diff;
}

export function generateSql(diff: SchemaDiff, dialect: "postgres" | "mysql"): string {
  const sqlCommands: string[] = [];

  const q = (name: string) => {
    return dialect === "postgres" ? `"${name}"` : `\`${name}\``;
  };

  // 1. Drop foreign keys first (avoid dependency errors)
  for (const alter of diff.tablesToAlter) {
    for (const fkName of alter.foreignKeysToDrop) {
      if (dialect === "postgres") {
        sqlCommands.push(`ALTER TABLE ${q(alter.tableName)} DROP CONSTRAINT ${q(fkName)};`);
      } else {
        sqlCommands.push(`ALTER TABLE ${q(alter.tableName)} DROP FOREIGN KEY ${q(fkName)};`);
      }
    }
  }

  // 2. Drop tables
  for (const name of diff.tablesToDrop) {
    if (dialect === "postgres") {
      sqlCommands.push(`DROP TABLE ${q(name)} CASCADE;`);
    } else {
      sqlCommands.push(`DROP TABLE ${q(name)};`);
    }
  }

  // 3. Drop columns
  for (const alter of diff.tablesToAlter) {
    for (const colName of alter.columnsToDrop) {
      sqlCommands.push(`ALTER TABLE ${q(alter.tableName)} DROP COLUMN ${q(colName)};`);
    }
  }

  // 4. Create new tables (columns + primary keys, foreign keys added in step 6)
  for (const table of diff.tablesToCreate) {
    const colDefinitions: string[] = [];
    
    for (const col of table.columns) {
      let def = `${q(col.name)} ${col.data_type}`;
      if (!col.nullable) {
        def += " NOT NULL";
      }
      if (col.is_pk) {
        def += " PRIMARY KEY";
      }
      colDefinitions.push(def);
    }

    sqlCommands.push(`CREATE TABLE ${q(table.name)} (\n  ${colDefinitions.join(",\n  ")}\n);`);
  }

  // 5. Add / Alter columns on existing tables
  for (const alter of diff.tablesToAlter) {
    const tableName = alter.tableName;

    // Add Columns
    for (const col of alter.columnsToAdd) {
      let def = `ALTER TABLE ${q(tableName)} ADD COLUMN ${q(col.name)} ${col.data_type}`;
      if (!col.nullable) {
        def += " NOT NULL";
      }
      if (col.is_pk) {
        def += " PRIMARY KEY";
      }
      sqlCommands.push(`${def};`);
    }

    // Modify Columns
    for (const mod of alter.columnsToModify) {
      const colName = mod.columnName;
      const to = mod.to;

      if (dialect === "postgres") {
        // Postgres: alter type
        sqlCommands.push(`ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} TYPE ${to.data_type};`);
        
        // Postgres: alter nullability
        if (to.nullable) {
          sqlCommands.push(`ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} DROP NOT NULL;`);
        } else {
          sqlCommands.push(`ALTER TABLE ${q(tableName)} ALTER COLUMN ${q(colName)} SET NOT NULL;`);
        }
      } else {
        // MySQL: Modify column syntax does both type and nullability in one command
        let def = `ALTER TABLE ${q(tableName)} MODIFY COLUMN ${q(colName)} ${to.data_type}`;
        if (!to.nullable) {
          def += " NOT NULL";
        }
        if (to.is_pk) {
          def += " PRIMARY KEY";
        }
        sqlCommands.push(`${def};`);
      }
    }
  }

  // 6. Add Foreign Keys last
  const appendFks = (tableName: string, fks: ForeignKeyInfo[]) => {
    for (const fk of fks) {
      const fkName = fk.name || `fk_${tableName}_${fk.columns}`;
      let stmt = `ALTER TABLE ${q(tableName)} ADD CONSTRAINT ${q(fkName)}\n` +
        `  FOREIGN KEY (${fk.columns.split(",").map(c => q(c.trim())).join(", ")})\n` +
        `  REFERENCES ${q(fk.referenced_table)} (${fk.referenced_columns.split(",").map(c => q(c.trim())).join(", ")})`;
      
      if (fk.on_update) {
        stmt += ` ON UPDATE ${fk.on_update}`;
      }
      if (fk.on_delete) {
        stmt += ` ON DELETE ${fk.on_delete}`;
      }
      sqlCommands.push(`${stmt};`);
    }
  };

  // Add FKs on newly created tables
  for (const table of diff.tablesToCreate) {
    if (table.foreignKeys.length > 0) {
      appendFks(table.name, table.foreignKeys);
    }
  }

  // Add FKs on altered tables
  for (const alter of diff.tablesToAlter) {
    if (alter.foreignKeysToAdd.length > 0) {
      appendFks(alter.tableName, alter.foreignKeysToAdd);
    }
  }

  if (sqlCommands.length === 0) {
    return "-- No changes detected. Database is up to date.";
  }

  return sqlCommands.join("\n\n");
}

export function generateMongooseCode(schema: DbSchema): string {
  const code: string[] = [
    `import mongoose, { Schema, Document } from 'mongoose';`,
    `\n// Generated visually using EasyDatabase\n`
  ];

  for (const [name, table] of Object.entries(schema.tables)) {
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    
    // Model Interface
    code.push(`export interface I${capitalized} extends Document {`);
    for (const col of table.columns) {
      if (col.name === "_id") continue;
      const jsType = mapMongoTypeToJs(col.data_type);
      code.push(`  ${col.name}${col.nullable ? '?' : ''}: ${jsType};`);
    }
    code.push(`}\n`);

    // Mongoose Schema Definition
    code.push(`const ${capitalized}Schema: Schema = new Schema({`);
    for (const col of table.columns) {
      if (col.name === "_id") continue;
      const mongoType = mapMongoTypeToMongoose(col.data_type);
      const parts: string[] = [`type: ${mongoType}`];
      if (!col.nullable) {
        parts.push(`required: true`);
      }
      
      // Look for virtual index or if it is foreign reference
      const isRef = name === "_id" ? false : table.foreignKeys.some(fk => fk.columns === col.name);
      if (isRef) {
        const refFk = table.foreignKeys.find(fk => fk.columns === col.name)!;
        const referencedCapitalized = refFk.referenced_table.charAt(0).toUpperCase() + refFk.referenced_table.slice(1);
        parts.push(`ref: '${referencedCapitalized}'`);
      }

      code.push(`  ${col.name}: { ${parts.join(', ')} },`);
    }
    code.push(`}, { timestamps: true });\n`);

    // Model Export
    code.push(`export const ${capitalized} = mongoose.models.${capitalized} || mongoose.model<I${capitalized}>('${capitalized}', ${capitalized}Schema);\n\n`);
  }

  return code.join("\n");
}

export function generatePrismaCode(schema: DbSchema, dbType: "postgres" | "mysql" | "mongodb"): string {
  const code: string[] = [
    `datasource db {`,
    `  provider = "${dbType}"`,
    `  url      = env("DATABASE_URL")`,
    `}`,
    `\ngenerator client {`,
    `  provider = "prisma-client-js"`,
    `}`,
    `\n// Generated visually using EasyDatabase\n`
  ];

  for (const [name, table] of Object.entries(schema.tables)) {
    const modelName = name.charAt(0).toUpperCase() + name.slice(1);
    code.push(`model ${modelName} {`);

    // Render columns
    for (const col of table.columns) {
      let pType = mapSqlTypeToPrisma(col.data_type, dbType);
      if (col.nullable) pType += "?";

      let attributes = "";
      if (col.is_pk) {
        if (dbType === "mongodb") {
          attributes += " @id @map(\"_id\") @db.ObjectId";
        } else {
          attributes += " @id";
          if (col.data_type.toUpperCase().includes("INT") || col.data_type.toUpperCase().includes("SERIAL")) {
            attributes += " @default(autoincrement())";
          }
        }
      }

      // Check if this column is part of a foreign key relations
      const fk = table.foreignKeys.find(f => f.columns === col.name);
      if (fk && dbType !== "mongodb") {
        attributes += ` @relation(fields: [${col.name}], references: [${fk.referenced_columns}])`;
      }

      code.push(`  ${col.name.padEnd(15)} ${pType.padEnd(10)}${attributes}`);
    }

    // Add back-references for foreign keys (Prisma requirement)
    // Find who references this table
    for (const [otherName, otherTable] of Object.entries(schema.tables)) {
      if (otherName === name) continue;
      for (const fk of otherTable.foreignKeys) {
        if (fk.referenced_table === name) {
          const otherModelName = otherName.charAt(0).toUpperCase() + otherName.slice(1);
          code.push(`  ${otherName.padEnd(15)} ${otherModelName}[]`);
        }
      }
    }

    code.push(`}\n`);
  }

  return code.join("\n");
}

// Helpers mapping database types to JS
function mapMongoTypeToJs(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("string") || t.includes("objectid")) return "string";
  if (t.includes("int") || t.includes("number") || t.includes("float") || t.includes("double")) return "number";
  if (t.includes("bool")) return "boolean";
  if (t.includes("date")) return "Date";
  return "any";
}

function mapMongoTypeToMongoose(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("objectid")) return "Schema.Types.ObjectId";
  if (t.includes("int") || t.includes("number") || t.includes("float") || t.includes("double")) return "Number";
  if (t.includes("bool")) return "Boolean";
  if (t.includes("date")) return "Date";
  if (t.includes("array")) return "Array";
  return "String";
}

function mapSqlTypeToPrisma(type: string, dbType: string): string {
  const t = type.toUpperCase();
  if (dbType === "mongodb" && t.includes("OBJECTID")) return "String";
  
  if (t.includes("INT") || t.includes("SERIAL")) return "Int";
  if (t.includes("BIGINT")) return "BigInt";
  if (t.includes("FLOAT") || t.includes("DOUBLE") || t.includes("DECIMAL") || t.includes("NUMERIC")) return "Decimal";
  if (t.includes("BOOL") || t.includes("TINYINT(1)")) return "Boolean";
  if (t.includes("DATE") || t.includes("TIME")) return "DateTime";
  if (t.includes("JSON")) return "Json";
  if (t.includes("BYTE") || t.includes("BLOB")) return "Bytes";
  return "String";
}
