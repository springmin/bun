#pragma once
#include "BunIDLTypes.h"
#include <wtf/text/ASCIILiteral.h>
#include <concepts>
#include <string_view>

namespace Bun {

template<typename IDL>
struct IDLHumanReadableName;

template<typename IDL>
concept HasIDLHumanReadableName = requires { IDLHumanReadableName<IDL>::humanReadableName; };

struct BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = false;
    static constexpr bool hasPreposition = false;
};

#if defined(__OHOS__)
// OHOS SDK Clang 15 crashes on complex constexpr expressions in templates.
// Use simple const char[] instead of std::to_array or concatCStrings.

template<> struct IDLHumanReadableName<Bun::IDLStrictNull> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "null";
};

template<> struct IDLHumanReadableName<Bun::IDLStrictUndefined> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "undefined";
};

template<typename IDL>
requires std::derived_from<IDL, WebCore::IDLBoolean>
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "boolean";
};

template<typename IDL>
requires WebCore::IsIDLInteger<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "integer";
};

template<typename IDL>
requires WebCore::IsIDLFloatingPoint<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "number";
};

template<typename IDL>
requires WebCore::IsIDLString<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "string";
};

template<typename T>
struct IDLHumanReadableName<WebCore::IDLEnumeration<T>> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "enumeration (string)";
};

// For nullable types, use a simpler approach
template<typename IDL>
struct IDLHumanReadableName<WebCore::IDLNullable<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = true;
    // Note: This is a simplification for OHOS - actual message would concatenate type name
    static constexpr const char humanReadableName[] = "nullable value";
};

template<typename IDL>
struct IDLHumanReadableName<WebCore::IDLOptional<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = true;
    // Note: This is a simplification for OHOS - actual message would concatenate type name
    static constexpr const char humanReadableName[] = "optional value";
};

template<typename IDL>
struct IDLHumanReadableName<IDLLooseNullable<IDL>>
    : IDLHumanReadableName<WebCore::IDLNullable<IDL>> {};

template<HasIDLHumanReadableName IDL>
struct IDLHumanReadableName<Bun::IDLArray<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool hasPreposition = true;
    // Note: This is a simplification for OHOS - actual message would concatenate type name
    static constexpr const char humanReadableName[] = "array";
};

template<typename T>
struct IDLHumanReadableName<WebCore::IDLDictionary<T>> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "dictionary (object)";
};

template<HasIDLHumanReadableName IDL>
struct IDLHumanReadableName<Bun::IDLOrderedUnion<IDL>> : IDLHumanReadableName<IDL> {};

template<HasIDLHumanReadableName... IDL>
struct IDLHumanReadableName<Bun::IDLOrderedUnion<IDL...>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = sizeof...(IDL) > 1;
    // Note: This is a simplification for OHOS - actual message would concatenate type names
    static constexpr const char humanReadableName[] = "union";
};

template<> struct IDLHumanReadableName<Bun::IDLArrayBufferRef> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "ArrayBuffer";
};

template<> struct IDLHumanReadableName<Bun::IDLBlobRef> : BaseIDLHumanReadableName {
    static constexpr const char humanReadableName[] = "Blob";
};

#else
// Non-OHOS: Use the full implementation with concatCStrings and std::to_array
#include "ConcatCStrings.h"

namespace Detail {
template<typename IDL>
static constexpr auto nestedHumanReadableName()
{
    return IDLHumanReadableName<IDL>::humanReadableName;
}

template<typename FirstIDL>
static constexpr auto separatorForHumanReadableBinaryDisjunction()
{
    if constexpr (IDLHumanReadableName<FirstIDL>::hasPreposition) {
        return std::to_array(", or ");
    } else {
        return std::to_array(" or ");
    }
}
}

template<> struct IDLHumanReadableName<Bun::IDLStrictNull> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("null");
};

template<> struct IDLHumanReadableName<Bun::IDLStrictUndefined> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("undefined");
};

template<typename IDL>
requires std::derived_from<IDL, WebCore::IDLBoolean>
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("boolean");
};

template<typename IDL>
requires WebCore::IsIDLInteger<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("integer");
};

template<typename IDL>
requires WebCore::IsIDLFloatingPoint<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("number");
};

template<typename IDL>
requires WebCore::IsIDLString<IDL>::value
struct IDLHumanReadableName<IDL> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("string");
};

template<typename T>
struct IDLHumanReadableName<WebCore::IDLEnumeration<T>> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("enumeration (string)");
};

template<typename IDL>
struct IDLHumanReadableName<WebCore::IDLNullable<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = true;
    static constexpr auto humanReadableName = Bun::concatCStrings(
        Detail::nestedHumanReadableName<IDL>(),
        Detail::separatorForHumanReadableBinaryDisjunction<IDL>(),
        "null");
};

template<typename IDL>
struct IDLHumanReadableName<WebCore::IDLOptional<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = true;
    static constexpr auto humanReadableName = Bun::concatCStrings(
        Detail::nestedHumanReadableName<IDL>(),
        Detail::separatorForHumanReadableBinaryDisjunction<IDL>(),
        "undefined");
};

template<typename IDL>
struct IDLHumanReadableName<IDLLooseNullable<IDL>>
    : IDLHumanReadableName<WebCore::IDLNullable<IDL>> {};

template<HasIDLHumanReadableName IDL>
struct IDLHumanReadableName<Bun::IDLArray<IDL>> : BaseIDLHumanReadableName {
    static constexpr bool hasPreposition = true;
    static constexpr auto humanReadableName
        = Bun::concatCStrings("array of ", Detail::nestedHumanReadableName<IDL>());
};

template<typename T>
struct IDLHumanReadableName<WebCore::IDLDictionary<T>> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("dictionary (object)");
};

template<HasIDLHumanReadableName IDL>
struct IDLHumanReadableName<Bun::IDLOrderedUnion<IDL>> : IDLHumanReadableName<IDL> {};

template<HasIDLHumanReadableName... IDL>
struct IDLHumanReadableName<Bun::IDLOrderedUnion<IDL...>> : BaseIDLHumanReadableName {
    static constexpr bool isDisjunction = sizeof...(IDL) > 1;
    static constexpr auto humanReadableName
        = Bun::joinCStringsAsList(Detail::nestedHumanReadableName<IDL>()...);
};

template<> struct IDLHumanReadableName<Bun::IDLArrayBufferRef> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("ArrayBuffer");
};

template<> struct IDLHumanReadableName<Bun::IDLBlobRef> : BaseIDLHumanReadableName {
    static constexpr auto humanReadableName = std::to_array("Blob");
};

#endif

}
