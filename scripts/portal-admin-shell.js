/**
 * JSON-CLI для локального desktop-приложения управления аккаунтами.
 * Используется scripts/portal-admin-gui.py
 */
require("./load-env-file").loadEnvFile();

const {
  listEquipment,
  listUsers,
  getUser,
  createUser,
  resetUserPassword,
  regenerateSticker,
  updateLabel,
  replaceEquipment,
  updateEquipmentQuantities,
  updateEquipmentSerials,
  setActive,
  deleteUser,
} = require("../src/portal-admin/portal-admin-service");

function readJsonArg(index) {
  const raw = process.argv[index];
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

function emitOk(data) {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

function emitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    error: message,
    statusCode: Number(error?.statusCode) || 500,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
}

async function main() {
  const command = process.argv[2];
  try {
    switch (command) {
      case "list-equipment":
        emitOk({ items: await listEquipment() });
        return;
      case "list-users":
        emitOk({ items: await listUsers() });
        return;
      case "list-all": {
        const [equipment, users] = await Promise.all([listEquipment(), listUsers()]);
        emitOk({ equipment, users });
        return;
      }
      case "get-user":
        emitOk({ user: await getUser(process.argv[3]) });
        return;
      case "create-user":
        emitOk(await createUser(readJsonArg(3)));
        return;
      case "reset-password":
        emitOk(
          await resetUserPassword({
            login: process.argv[3],
            ...readJsonArg(4),
          })
        );
        return;
      case "generate-sticker":
        emitOk(
          await regenerateSticker({
            login: process.argv[3],
            ...readJsonArg(4),
          })
        );
        return;
      case "set-label":
        emitOk({
          user: await updateLabel(process.argv[3], readJsonArg(4).label ?? ""),
        });
        return;
      case "set-equipment":
        emitOk({
          user: await replaceEquipment(
            process.argv[3],
            readJsonArg(4).equipmentIds || [],
            readJsonArg(4).equipmentQuantities || {}
          ),
        });
        return;
      case "set-equipment-quantities":
        emitOk({
          user: await updateEquipmentQuantities(process.argv[3], readJsonArg(4).equipmentQuantities || {}),
        });
        return;
      case "set-equipment-serials":
        emitOk({
          user: await updateEquipmentSerials(process.argv[3], readJsonArg(4).equipmentSerials || {}),
        });
        return;
      case "set-active":
        emitOk({
          user: await setActive(process.argv[3], readJsonArg(4).active),
        });
        return;
      case "delete-user":
        emitOk({
          user: await deleteUser(process.argv[3]),
        });
        return;
      default:
        throw new Error(`Unknown command: ${command || "(empty)"}`);
    }
  } catch (error) {
    emitError(error);
  }
}

main();
