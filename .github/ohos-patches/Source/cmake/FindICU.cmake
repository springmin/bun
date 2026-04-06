# Custom FindICU for cross-compilation
# This module sets up ICU for cross-compilation by using explicit paths

if(ICU_FOUND)
  return()
endif()

if(NOT ICU_ROOT)
  if(DEFINED ENV{ICU_ROOT})
    set(ICU_ROOT "$ENV{ICU_ROOT}")
  endif()
endif()

if(NOT ICU_ROOT)
  message(FATAL_ERROR "ICU_ROOT not set")
endif()

if(NOT ICU_INCLUDE_DIRS)
  set(ICU_INCLUDE_DIRS "${ICU_ROOT}/include")
endif()

message(STATUS "Custom FindICU: ICU_ROOT=${ICU_ROOT}")
message(STATUS "Custom FindICU: ICU_INCLUDE_DIRS=${ICU_INCLUDE_DIRS}")

# Set library paths directly without find_library
set(ICU_DATA_LIBRARY "${ICU_ROOT}/lib/libicudata.a")
set(ICU_I18N_LIBRARY "${ICU_ROOT}/lib/libicui18n.a")
set(ICU_UC_LIBRARY "${ICU_ROOT}/lib/libicuuc.a")
set(ICU_IO_LIBRARY "${ICU_ROOT}/lib/libicuio.a")
set(ICU_TU_LIBRARY "${ICU_ROOT}/lib/libicutu.a")

# Check if files exist
set(ICU_FOUND TRUE)
foreach(LIB ICU_DATA_LIBRARY ICU_I18N_LIBRARY ICU_UC_LIBRARY)
  if(NOT EXISTS "${${LIB}}")
    message(STATUS "ICU library not found: ${${LIB}}")
    set(ICU_FOUND FALSE)
  endif()
endforeach()

if(ICU_FOUND)
  set(ICU_LIBRARIES ${ICU_DATA_LIBRARY} ${ICU_I18N_LIBRARY} ${ICU_UC_LIBRARY} ${ICU_IO_LIBRARY} ${ICU_TU_LIBRARY})
  
  # Try to get version from header
  if(EXISTS "${ICU_INCLUDE_DIRS}/unicode/uversion.h")
    file(READ "${ICU_INCLUDE_DIRS}/unicode/uversion.h" UVERSION_H)
    string(REGEX MATCH "#define[ \t]+U_ICU_VERSION_MAJOR_NUM[ \t]+([0-9]+)" _ ${UVERSION_H})
    set(ICU_MAJOR_VERSION ${CMAKE_MATCH_1})
    string(REGEX MATCH "#define[ \t]+U_ICU_VERSION_MINOR_NUM[ \t]+([0-9]+)" _ ${UVERSION_H})
    set(ICU_MINOR_VERSION ${CMAKE_MATCH_1})
    set(ICU_VERSION "${ICU_MAJOR_VERSION}.${ICU_MINOR_VERSION}")
  endif()
  
  message(STATUS "Found ICU: ${ICU_ROOT} (found version \"${ICU_VERSION}\")")
  message(STATUS "ICU data: ${ICU_DATA_LIBRARY}")
  message(STATUS "ICU i18n: ${ICU_I18N_LIBRARY}")
  message(STATUS "ICU uc: ${ICU_UC_LIBRARY}")
  
  # Set cache variables
  set(ICU_FOUND TRUE CACHE BOOL "ICU found" FORCE)
  set(ICU_INCLUDE_DIRS "${ICU_INCLUDE_DIRS}" CACHE PATH "ICU include directories" FORCE)
  set(ICU_LIBRARIES "${ICU_LIBRARIES}" CACHE STRING "ICU libraries" FORCE)
  set(ICU_VERSION "${ICU_VERSION}" CACHE STRING "ICU version" FORCE)
endif()

# Create imported targets
if(ICU_FOUND AND NOT TARGET ICU::data)
  add_library(ICU::data STATIC IMPORTED GLOBAL)
  set_target_properties(ICU::data PROPERTIES
    IMPORTED_LOCATION "${ICU_DATA_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${ICU_INCLUDE_DIRS}"
  )
endif()

if(ICU_FOUND AND NOT TARGET ICU::i18n)
  add_library(ICU::i18n STATIC IMPORTED GLOBAL)
  set_target_properties(ICU::i18n PROPERTIES
    IMPORTED_LOCATION "${ICU_I18N_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${ICU_INCLUDE_DIRS}"
  )
endif()

if(ICU_FOUND AND NOT TARGET ICU::uc)
  add_library(ICU::uc STATIC IMPORTED GLOBAL)
  set_target_properties(ICU::uc PROPERTIES
    IMPORTED_LOCATION "${ICU_UC_LIBRARY}"
    INTERFACE_INCLUDE_DIRECTORIES "${ICU_INCLUDE_DIRS}"
  )
endif()
