local HttpService = game:GetService('HttpService')

---

local module = {}

local Logger = {}
Logger.__index = Logger

function Logger.new(context)
	local self = {}
	self.Context = context
	self._log = {}
	self._cancelled = false
	setmetatable(self, Logger)
	return self
end

function Logger:AddLine(line)
	self._log[#self._log + 1] = line
end

function Logger:UploadLogs()
	assert(not self._cancelled, 'Cannot run UploadLogs on a cancelled Logger')
	if not self._log[1] then
		return
	end
	local success, err = pcall(function()
		local log = self._log
		self._log = {}
		local success, err
		while not success do
			local minRetryTick = tick() + 5
			local result
			success, err = pcall(function()
				result = HttpService:RequestAsync({
					Url = 'http://127.0.0.1:32337/log/',
					Method = 'POST',
					Headers = {
						['Content-Type'] = 'application/json',
					},
					Body = HttpService:JSONEncode({
						Context = self.Context,
						Logs = log,
					}),
				})
			end)
			if not success then
				warn('Failed to upload to VS Code (retrying) because: HttpService', err)
				if tick() < minRetryTick then
					wait(minRetryTick - tick())
				end
			else
				if not result.Success then
					warn('Failed to upload to VS Code (skipping) because: Status', result.StatusCode, result.Body)
				end
			end
			if self._cancelled then
				return
			end
		end
	end)
	if not success then
		warn('Failed to upload to VS Code (unknown) because: Unknown',err)
	end
end

function Logger:Cancel()
	self._cancelled = true
end

module.Logger = Logger

return module