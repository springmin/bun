/*
 * OHOS libc++ compatibility shim
 *
 * LLVM's libc++ expects certain functions and definitions that OHOS's musl-based
 * sysroot doesn't provide. This header bridges those gaps.
 *
 * Include this header BEFORE any libc++ headers when building for OHOS.
 */

#ifndef __OHOS_LIBCPP_SHIM_H__
#define __OHOS_LIBCPP_SHIM_H__

/* ---------------------------------------------------------------------------
 * 1. Rune table — OHOS is not a recognized platform in libc++'s __locale.
 *
 *    libc++ uses a static ctype::mask table (the "rune table") for character
 *    classification.  On unknown platforms it emits:
 *
 *      #error unknown rune table for this platform -- \
 *              do you mean to define _LIBCPP_PROVIDES_DEFAULT_RUNE_TABLE?
 *
 *    Defining this macro tells libc++ to fall back to a portable default
 *    rune table instead of erroring out.
 * --------------------------------------------------------------------------- */
#define _LIBCPP_PROVIDES_DEFAULT_RUNE_TABLE 1

/* ---------------------------------------------------------------------------
 * 2. strtoll_l / strtoull_l — locale-specific string-to-integer conversions
 *
 *    OHOS uses musl libc, which intentionally does NOT provide the _l
 *    (locale-extended) variants.  libc++'s <__locale_dir/support/linux.h>
 *    calls these unconditionally.
 *
 *    Shim: delegate to the non-locale versions, ignoring the locale_t param.
 * --------------------------------------------------------------------------- */

#include <stdlib.h>
#include <locale.h>

#if defined(__OHOS__) || defined(__MUSL__)
#ifndef _LOCALE_T_DEFINED
typedef void* locale_t;
#endif
#endif

#ifdef __cplusplus
extern "C" {
#endif

static inline long long strtoll_l(const char* __restrict nptr,
                                   char** __restrict endptr,
                                   int base,
                                   locale_t locale) {
    (void)locale;
    return strtoll(nptr, endptr, base);
}

static inline unsigned long long strtoull_l(const char* __restrict nptr,
                                             char** __restrict endptr,
                                             int base,
                                             locale_t locale) {
    (void)locale;
    return strtoull(nptr, endptr, base);
}

#ifdef __cplusplus
}
#endif

#endif /* __OHOS_LIBCPP_SHIM_H__ */
