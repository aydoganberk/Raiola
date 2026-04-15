import asyncio
import os

from agents import Agent, Runner
from agents.mcp import MCPServerStdio


async def main() -> None:
    codex_home = os.environ.get("CODEX_HOME") or os.path.join(os.getcwd(), ".codex")
    env = os.environ.copy()
    env["CODEX_HOME"] = codex_home

    async with MCPServerStdio(
        name="Codex CLI",
        params={
            "command": "codex",
            "args": ["mcp-server"],
            "env": env,
        },
        client_session_timeout_seconds=360000,
    ) as codex_server:
        planner = Agent(
            name="Raiola Planner",
            instructions="Plan first. Keep tasks bounded and reviewable. Use Codex MCP to inspect the repo before proposing work.",
            mcp_servers=[codex_server],
        )
        operator = Agent(
            name="Raiola Operator",
            instructions="Use the plan, enforce bounded scopes, and report verification plus next actions.",
            mcp_servers=[codex_server],
        )

        plan = await Runner.run(planner, "Summarize the repository, choose the safest lane, and list bounded next steps.")
        result = await Runner.run(operator, f"Use this plan and continue only with reviewable steps:

{plan.final_output}")
        print(result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
