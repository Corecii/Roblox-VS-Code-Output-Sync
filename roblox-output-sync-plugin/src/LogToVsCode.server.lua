local LogService = game:GetService('LogService')
local HttpService = game:GetService('HttpService')
local RunService = game:GetService('RunService')

---

if not RunService:IsEdit() then
	return
end

local function formatText(text, mType)
	if mType == 'error' then
		return '\27[91m'..text..'\27[0m'
	elseif mType == 'warn' then
		return '\27[93m'..text..'\27[0m'
	elseif mType == 'info' then
		return '\27[96m'..text..'\27[0m'
	elseif mType == 'output' then
		return text
	end
end

---

local UPLOAD_FREQUENCY = 1

local CONTEXT = ('%s (%d): %s'):format(game.Name, game.PlaceId, 'All')

local messageTypeMap = {
	[Enum.MessageType.MessageOutput] = 'output',
	[Enum.MessageType.MessageInfo] = 'info',
	[Enum.MessageType.MessageWarning] = 'warn',
	[Enum.MessageType.MessageError] = 'error',
}

---


local conns

local function stop()
	if conns then
		for _, conn in pairs(conns) do
			conn:Disconnect()
		end
		conns = nil
	end
end

plugin.Unloading:Connect(stop)

local function start()
	if conns then
		stop()
	end
	conns = {}
	local log = {}
	local disabled = false
	conns[#conns + 1] = LogService.MessageOut:Connect(function(message, messageType)
		if disabled then
			return
		end
		disabled = true
		pcall(function()
			local mType = messageTypeMap[messageType]
			log[#log + 1] = formatText(message, mType)
		end)
		disabled = false
	end)
	
	local lastUpload = tick()
	local function upload(clear)
		if #log == 0 then
			return
		end
		disabled = true
		lastUpload = tick()
		local result
		local success, err = pcall(function()
			local newLog = log
			log = {}
			result = HttpService:RequestAsync({
				Url = 'http://localhost:32337/log',
				Method = 'POST',
				Body = HttpService:JSONEncode({
					Context = CONTEXT,
					Clear = clear,
					Logs = newLog,
				}),
				Headers = {
					["Content-Type"] = "application/json",
				},
			})
		end)
		if not success then
			warn('Failed to upload output to VS Code because:',err)
		elseif not result.Success then
			warn('Failed to upload output to VS Code because:',result.StatusCode,result.Body)
		end
		disabled = false
	end
	
	do
		local logsToAdd = LogService:GetLogHistory()
		for _, value in ipairs(logsToAdd) do
			local mType = messageTypeMap[value.messageType]
			log[#log + 1] = formatText(value.message, mType)
		end
		upload(true)
	end
	
	conns[#conns + 1] = RunService.Heartbeat:Connect(function()
		if tick() - lastUpload >= UPLOAD_FREQUENCY then
			upload(false)
		end
	end)
end

local toolbar = plugin:CreateToolbar('VSCode Output')

local button = toolbar:CreateButton('Toggle', '', '')

button.Click:Connect(function()
	if conns then
		button:SetActive(false)
		stop()
	else
		button:SetActive(true)
		start()
	end
end)