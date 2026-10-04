import { afterEach, beforeEach, spyOn } from "bun:test"
import { toast } from "sonner"

/** Register spies in the calling test file, not when this shared module is loaded. */
export function feedbackSpies() {
  let success: ReturnType<typeof spyOn<typeof toast, "success">>
  let error: ReturnType<typeof spyOn<typeof toast, "error">>

  beforeEach(() => {
    toast.dismiss()
    success = spyOn(toast, "success")
    error = spyOn(toast, "error")
  })
  afterEach(() => {
    success.mockRestore()
    error.mockRestore()
    toast.dismiss()
  })

  return { get success() { return success }, get error() { return error } }
}
