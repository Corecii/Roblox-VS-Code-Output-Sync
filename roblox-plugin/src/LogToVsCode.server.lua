local LogService = game:GetService('LogService')
local RunService = game:GetService('RunService')

if not RunService:IsEdit() then
	return
end

local Api1 = require(script.Parent.Api1)
local Api2 = require(script.Parent.Api2)

--- Constants

local UPLOAD_FREQUENCY = 1

local CONTEXT = ('%s (%d): %s'):format(game.Name, game.PlaceId, 'All')

local VSC_VERSION = {0, 1, 0}
local RBX_VERSION = {0, 1, 0}

local messageTypeMap = {
	[Enum.MessageType.MessageOutput] = 'output',
	[Enum.MessageType.MessageInfo] = 'info',
	[Enum.MessageType.MessageWarning] = 'warn',
	[Enum.MessageType.MessageError] = 'error',
}

--- Variables

local vscPluginUpdateWarningShownThisSession = false

local conns -- set when running, nil when not running; new value each run session, same value for a whole session

local logger

---

-- format text for the terminal, including newline fixing and colorizing escape sequences
local function formatText(text, messageType)
	text = text:gsub('[\r\n]', '\r\n')
	if messageType == 'error' then
		return '\27[91m'..text..'\27[0m'
	elseif messageType == 'warn' then
		return '\27[93m'..text..'\27[0m'
	elseif messageType == 'info' then
		return '\27[96m'..text..'\27[0m'
	elseif messageType == 'output' then
		return text
	end
end

local function isVersionOld(base, check)
	if base[1] > check[1] then
		return true
	elseif base[1] < check[1] then
		return false
	end
	if base[2] > check[2] then
		return true
	elseif base[2] < check[2] then
		return false
	end
	if base[3] > check[3] then
		return true
	elseif base[3] < check[3] then
		return false
	end
	return false
end

local function formatVersion(version)
	return ('%d.%d.%d'):format(version[1], version[2], version[3])
end

local function stop()
	if conns then
		for _, conn in pairs(conns) do
			conn:Disconnect()
		end
		conns = nil
		if logger then
			logger:Cancel()
		end
	end
end

local function start()
	if conns then
		stop()
	end
	conns = {}
	local sessionConns = conns

	local canUseLog2
	do
		local success, versionOrError, reqVersion
		while not success do
			local minLoopTime = tick() + 5
			success, versionOrError, reqVersion = Api2:GetVersion(RBX_VERSION)
			if not success then
				warn('Failed to get VS Code extension version. Is the extension running? Reason:',versionOrError)
			end
			if not success and tick() < minLoopTime then
				wait(minLoopTime - tick())
			end
			if conns ~= sessionConns then
				return
			end
		end
		if reqVersion and isVersionOld(reqVersion, RBX_VERSION) then
			warn(
				'Your Roblox Output Sync Roblox plugin is out of date! The VS Code extension is requiring at least version',
				formatVersion(reqVersion)
			)
		end
		if not vscPluginUpdateWarningShownThisSession and isVersionOld(VSC_VERSION, versionOrError) then
			vscPluginUpdateWarningShownThisSession = true
			print(
				'An update is available for the Roblox Output Sync VS Code extension:',
				formatVersion(versionOrError),'->',formatVersion(VSC_VERSION)
			)
		end
		if versionOrError[1] >= 0 and versionOrError[2] >= 1 and versionOrError[3] >= 0 then
			canUseLog2 = true
		end
	end

	if canUseLog2 then
		logger = Api2.Logger.new(CONTEXT)
	else
		logger = Api1.Logger.new(CONTEXT)
	end

	local disabled = false

	conns[#conns + 1] = LogService.MessageOut:Connect(function(message, messageType)
		if disabled then
			return
		end
		disabled = true
		pcall(function()
			logger:AddLine(formatText(message, messageTypeMap[messageType]))
		end)
		disabled = false
	end)
	
	spawn(function()
		local lastUpload = 0
		while conns == sessionConns do
			if tick() - lastUpload >= UPLOAD_FREQUENCY then
				lastUpload = tick()
				logger:UploadLogs()
			end
			RunService.Heartbeat:Wait()
		end
	end)
	
	do
		local logsToAdd = LogService:GetLogHistory()
		for _, value in ipairs(logsToAdd) do
			logger:AddLine(formatText(value.message, messageTypeMap[value.messageType]))
		end
	end
end

--- Setup

do
	local toolbar = plugin:CreateToolbar('VS Code Output '..formatVersion(RBX_VERSION))

	local button = toolbar:CreateButton('Toggle', 'Turn output sync on/off', 'rbxassetid://4170103293')

	button.Click:Connect(function()
		if conns then
			button:SetActive(false)
			stop()
		else
			button:SetActive(true)
			start()
		end
	end)

	plugin.Unloading:Connect(stop)
end