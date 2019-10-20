local HttpService = game:GetService('HttpService')

local HTTP_POST_CHAR_LIMIT = 1000*900 -- requests will be split into chunks this big
local LINE_CHAR_LIMIT = 1000*900*3 -- lines larger than this will be discarded
local MAX_QUEUED = 10 -- once the queue reaches this size, queued logs will be removed and not sent to vs code

---

local module = {}

function module:GetVersion(rbxVersion)
	local result
	local success, err = pcall(function()
		result = HttpService:RequestAsync({
			Url = 'http://localhost:32337/version',
			Method = 'POST',
			Body = HttpService:JSONEncode({
				version = rbxVersion,
			}),
			Headers = {
				["Content-Type"] = "application/json",
			},
		})
	end)
	if not success then
		return false, err
	end
	if not result.Success then
		if result.StatusCode ~= 404 then
			return false, result.Body
		end
		return true, {0, 0, 3}
	end
	local json
	success, err = pcall(function()
		json = HttpService:JSONDecode(result.Body)
	end)
	if not success then
		return false, 'JSON failure: '..err
	elseif not json.success then
		return false, json.reason and tostring(json.reason) or 'Unknown'
	elseif not json.version then
		return false, 'Missing version'
	end
	return true, json.version, json.requiredVersion
end

local Logger = {}
Logger.__index = Logger

function Logger.new(context)
	local self = {}
	self.Context = context
	self._log = {}
	self._logChars = 0
	self._queued = {}
	self._uploading = false
	self._cancelled = false
	setmetatable(self, Logger)
	return self
end

function Logger:EnqueueCurrentLog()
	if self._logChars == 0 then
		return
	end
	self._queued[#self._queued + 1] = table.concat(self._log, '')
	if #self._queued > MAX_QUEUED then
		table.remove(self._queued, 1)
	end
	self._log = {}
	self._logChars = 0
end

function Logger:AddLine(line)
	local text = line..'\r\n'
	if #text > LINE_CHAR_LIMIT then
		return
	end
	while self._logChars + #text > HTTP_POST_CHAR_LIMIT do
		local pre = text:sub(1, HTTP_POST_CHAR_LIMIT - self._logChars)
		text = text:sub(HTTP_POST_CHAR_LIMIT - self._logChars + 1, -1)
		self._log[#self._log + 1] = pre
		self._logChars = HTTP_POST_CHAR_LIMIT
		self:EnqueueCurrentLog()
	end
	self._log[#self._log + 1] = text
	self._logChars = self._logChars + #text
end

function Logger:UploadLogs()
	assert(not self._cancelled, 'Cannot run UploadLogs on a cancelled Logger')
	if self._uploading then
		return
	end
	self._uploading = true
	local success, err = pcall(function()
		if self._logChars > 0 then
			self:EnqueueCurrentLog()
		end
		while self._queued[1] do
			local minRetryTick = tick() + 5
			local result
			local success, err = pcall(function()
				result = HttpService:RequestAsync({
					Url = 'http://127.0.0.1:32337/log2/'..self.Context,
					Method = 'POST',
					Headers = {
						['Content-Type'] = 'text/plain',
					},
					Body = self._queued[1],
				})
			end)
			if not success then
				warn('Failed to upload to VS Code (retrying) because: HttpService', err)
				if tick() < minRetryTick then
					wait(minRetryTick - tick())
				end
			else
				table.remove(self._queued, 1)
				if not result.Success then
					warn('Failed to upload to VS Code (skipping) because: Status', result.StatusCode, result.Body)
				else
					success, err = pcall(function()
						result = HttpService:JSONDecode(result.Body)
					end)
					if not success then
						warn('Failed to upload to VS Code (skipping) because: JSON',err,result.Body)
					elseif not result.success then
						warn('Failed to upload to VS Code (skipping) because: Sync',result.reason)
					end
				end
			end
			if self._cancelled then
				return
			end
		end
	end)
	self._uploading = false
	if not success then
		warn('Failed to upload to VS Code (unknown) because: Unknown',err)
	end
end

function Logger:Cancel()
	self._cancelled = true
end

module.Logger = Logger

return module