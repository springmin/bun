// Preloaded into a process, makes it end with exit() where it would end with quick_exit().
#include <cstdlib>

extern "C"
#if !defined(__OHOS__)
    [[noreturn]]
#endif
    void quick_exit(int code)
#if !defined(__OHOS__)
        noexcept
#endif
{
    exit(code);
}
