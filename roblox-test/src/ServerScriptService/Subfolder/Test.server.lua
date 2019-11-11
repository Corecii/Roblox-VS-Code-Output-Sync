local function doError()
	print('\nTraceback (mini paths):')
	print(debug.traceback())
	print('')
	error('Error: from ModuleScript in subfolder')
end

doError()