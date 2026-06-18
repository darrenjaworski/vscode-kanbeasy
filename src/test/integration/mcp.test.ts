import * as assert from "assert";
import * as vscode from "vscode";

suite("MCP integration", () => {
  test("activates and registers the MCP provider contribution", async () => {
    const ext = vscode.extensions.getExtension("darrenjaworski.kanbeasy");
    assert.ok(ext, "extension not found");
    await ext!.activate();
    const contributes = ext!.packageJSON.contributes;
    const providers = contributes.mcpServerDefinitionProviders;
    assert.ok(
      Array.isArray(providers) &&
        providers.some((p: { id: string }) => p.id === "kanbeasy.mcp"),
      "kanbeasy.mcp provider not contributed",
    );
  });

  test("toggleBoard command is registered", async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("kanbeasy.toggleBoard"));
  });
});
