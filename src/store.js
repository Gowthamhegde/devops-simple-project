import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VALID_STATUSES = new Set(["backlog", "in-progress", "done"]);

const defaultBoard = {
  items: [
    {
      id: "seed-1",
      title: "Create staging smoke checklist",
      service: "frontend",
      environment: "staging",
      owner: "Ava",
      status: "backlog",
      createdAt: "2026-04-25T08:30:00.000Z",
      updatedAt: "2026-04-25T08:30:00.000Z"
    },
    {
      id: "seed-2",
      title: "Validate release notes before deploy",
      service: "api",
      environment: "staging",
      owner: "Mika",
      status: "in-progress",
      createdAt: "2026-04-25T09:10:00.000Z",
      updatedAt: "2026-04-25T09:10:00.000Z"
    },
    {
      id: "seed-3",
      title: "Confirm rollback command path",
      service: "worker",
      environment: "production",
      owner: "Rin",
      status: "done",
      createdAt: "2026-04-25T10:45:00.000Z",
      updatedAt: "2026-04-25T10:45:00.000Z"
    }
  ]
};

function clone(value) {
  return structuredClone(value);
}

function normalizeItem(input) {
  return {
    title: String(input.title || "").trim(),
    service: String(input.service || "").trim() || "app",
    environment: String(input.environment || "").trim() || "staging",
    owner: String(input.owner || "").trim() || "unassigned",
    status: VALID_STATUSES.has(input.status) ? input.status : "backlog"
  };
}

export class JsonBoardStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.board = clone(defaultBoard);
    this.ready = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content);
      this.board = {
        items: Array.isArray(parsed.items) ? parsed.items : clone(defaultBoard.items)
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }

      this.board = clone(defaultBoard);
      await this.persist();
    }

    this.ready = true;
  }

  async persist() {
    const payload = JSON.stringify(this.board, null, 2);
    this.writeChain = this.writeChain.then(() => writeFile(this.filePath, payload, "utf8"));
    await this.writeChain;
  }

  listItems() {
    return clone(this.board.items).sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }

  getCounts() {
    return this.listItems().reduce(
      (accumulator, item) => {
        accumulator.total += 1;
        accumulator[item.status] += 1;
        return accumulator;
      },
      {
        total: 0,
        backlog: 0,
        "in-progress": 0,
        done: 0
      }
    );
  }

  async addItem(input) {
    const item = normalizeItem(input);
    if (!item.title) {
      const error = new Error("Title is required.");
      error.statusCode = 400;
      throw error;
    }

    const timestamp = new Date().toISOString();
    const created = {
      id: randomUUID(),
      ...item,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.board.items.unshift(created);
    await this.persist();
    return clone(created);
  }

  async updateItem(id, patch) {
    const index = this.board.items.findIndex((item) => item.id === id);
    if (index === -1) {
      const error = new Error("Item not found.");
      error.statusCode = 404;
      throw error;
    }

    const current = this.board.items[index];
    const next = normalizeItem({
      ...current,
      ...patch
    });

    if (!next.title) {
      const error = new Error("Title is required.");
      error.statusCode = 400;
      throw error;
    }

    this.board.items[index] = {
      ...current,
      ...next,
      updatedAt: new Date().toISOString()
    };

    await this.persist();
    return clone(this.board.items[index]);
  }

  async deleteItem(id) {
    const index = this.board.items.findIndex((item) => item.id === id);
    if (index === -1) {
      const error = new Error("Item not found.");
      error.statusCode = 404;
      throw error;
    }

    const [removed] = this.board.items.splice(index, 1);
    await this.persist();
    return clone(removed);
  }
}
