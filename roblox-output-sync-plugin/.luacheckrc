max_line_length = 120
max_comment_line_length = 120

stds.roblox = {
    globals = {
            "game", "workspace"
    },
    read_globals = {
            -- Roblox globals
            "script", "plugin",

            -- Extra functions
            "tick", "warn", "spawn",
            "wait", "settings", "typeof",

            -- Libraries with roblox-specific additional methods
            "math", "string", "bit32", "debug",

            -- Types
            "Vector2", "Vector3",
            "Color3",
            "UDim", "UDim2",
            "Rect",
            "CFrame",
            "Enum",
            "Instance"
    }
}

ignore = {
    "2../.*_", -- unused arguments
    "212/self",
    "421", -- shadowing local variable
    "422", -- shadowing argument
    "431", -- shadowing upvalue
    "432", -- shadowing upvalue argument
    "611", -- line contains only whitespace
    "613", -- trailing whitespace in a string
    "213/.*_" -- unused loop variables
}

std = "lua51+roblox"

exclude_files = {"**/.luacheckrc", "**/.defineGlobals.lua"}