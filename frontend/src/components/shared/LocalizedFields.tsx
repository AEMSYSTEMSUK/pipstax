"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export const COUNTRY_OPTIONS = [
  { value: "Afghanistan", label: "Afghanistan", dialCode: "+93" },
  { value: "Albania", label: "Albania", dialCode: "+355" },
  { value: "Algeria", label: "Algeria", dialCode: "+213" },
  { value: "Andorra", label: "Andorra", dialCode: "+376" },
  { value: "Angola", label: "Angola", dialCode: "+244" },
  { value: "Antigua and Barbuda", label: "Antigua and Barbuda", dialCode: "+1" },
  { value: "Argentina", label: "Argentina", dialCode: "+54" },
  { value: "Armenia", label: "Armenia", dialCode: "+374" },
  { value: "Australia", label: "Australia", dialCode: "+61" },
  { value: "Austria", label: "Austria", dialCode: "+43" },
  { value: "Azerbaijan", label: "Azerbaijan", dialCode: "+994" },
  { value: "Bahamas", label: "Bahamas", dialCode: "+1" },
  { value: "Bahrain", label: "Bahrain", dialCode: "+973" },
  { value: "Bangladesh", label: "Bangladesh", dialCode: "+880" },
  { value: "Barbados", label: "Barbados", dialCode: "+1" },
  { value: "Belarus", label: "Belarus", dialCode: "+375" },
  { value: "Belgium", label: "Belgium", dialCode: "+32" },
  { value: "Belize", label: "Belize", dialCode: "+501" },
  { value: "Benin", label: "Benin", dialCode: "+229" },
  { value: "Bhutan", label: "Bhutan", dialCode: "+975" },
  { value: "Bolivia", label: "Bolivia", dialCode: "+591" },
  { value: "Bosnia and Herzegovina", label: "Bosnia and Herzegovina", dialCode: "+387" },
  { value: "Botswana", label: "Botswana", dialCode: "+267" },
  { value: "Brazil", label: "Brazil", dialCode: "+55" },
  { value: "Brunei", label: "Brunei", dialCode: "+673" },
  { value: "Bulgaria", label: "Bulgaria", dialCode: "+359" },
  { value: "Burkina Faso", label: "Burkina Faso", dialCode: "+226" },
  { value: "Burundi", label: "Burundi", dialCode: "+257" },
  { value: "Cambodia", label: "Cambodia", dialCode: "+855" },
  { value: "Cameroon", label: "Cameroon", dialCode: "+237" },
  { value: "Canada", label: "Canada", dialCode: "+1" },
  { value: "Cape Verde", label: "Cape Verde", dialCode: "+238" },
  { value: "Central African Republic", label: "Central African Republic", dialCode: "+236" },
  { value: "Chad", label: "Chad", dialCode: "+235" },
  { value: "Chile", label: "Chile", dialCode: "+56" },
  { value: "China", label: "China", dialCode: "+86" },
  { value: "Colombia", label: "Colombia", dialCode: "+57" },
  { value: "Comoros", label: "Comoros", dialCode: "+269" },
  { value: "Congo", label: "Congo", dialCode: "+242" },
  { value: "Costa Rica", label: "Costa Rica", dialCode: "+506" },
  { value: "Cote d'Ivoire", label: "Cote d'Ivoire", dialCode: "+225" },
  { value: "Croatia", label: "Croatia", dialCode: "+385" },
  { value: "Cuba", label: "Cuba", dialCode: "+53" },
  { value: "Cyprus", label: "Cyprus", dialCode: "+357" },
  { value: "Czech Republic", label: "Czech Republic", dialCode: "+420" },
  { value: "Denmark", label: "Denmark", dialCode: "+45" },
  { value: "Djibouti", label: "Djibouti", dialCode: "+253" },
  { value: "Dominica", label: "Dominica", dialCode: "+1" },
  { value: "Dominican Republic", label: "Dominican Republic", dialCode: "+1" },
  { value: "Ecuador", label: "Ecuador", dialCode: "+593" },
  { value: "Egypt", label: "Egypt", dialCode: "+20" },
  { value: "El Salvador", label: "El Salvador", dialCode: "+503" },
  { value: "Equatorial Guinea", label: "Equatorial Guinea", dialCode: "+240" },
  { value: "Eritrea", label: "Eritrea", dialCode: "+291" },
  { value: "Estonia", label: "Estonia", dialCode: "+372" },
  { value: "Eswatini", label: "Eswatini", dialCode: "+268" },
  { value: "Ethiopia", label: "Ethiopia", dialCode: "+251" },
  { value: "Fiji", label: "Fiji", dialCode: "+679" },
  { value: "Finland", label: "Finland", dialCode: "+358" },
  { value: "France", label: "France", dialCode: "+33" },
  { value: "Gabon", label: "Gabon", dialCode: "+241" },
  { value: "Gambia", label: "Gambia", dialCode: "+220" },
  { value: "Georgia", label: "Georgia", dialCode: "+995" },
  { value: "Germany", label: "Germany", dialCode: "+49" },
  { value: "Ghana", label: "Ghana", dialCode: "+233" },
  { value: "Greece", label: "Greece", dialCode: "+30" },
  { value: "Grenada", label: "Grenada", dialCode: "+1" },
  { value: "Guatemala", label: "Guatemala", dialCode: "+502" },
  { value: "Guinea", label: "Guinea", dialCode: "+224" },
  { value: "Guinea-Bissau", label: "Guinea-Bissau", dialCode: "+245" },
  { value: "Guyana", label: "Guyana", dialCode: "+592" },
  { value: "Haiti", label: "Haiti", dialCode: "+509" },
  { value: "Honduras", label: "Honduras", dialCode: "+504" },
  { value: "Hong Kong", label: "Hong Kong", dialCode: "+852" },
  { value: "Hungary", label: "Hungary", dialCode: "+36" },
  { value: "Iceland", label: "Iceland", dialCode: "+354" },
  { value: "India", label: "India", dialCode: "+91" },
  { value: "Indonesia", label: "Indonesia", dialCode: "+62" },
  { value: "Iran", label: "Iran", dialCode: "+98" },
  { value: "Iraq", label: "Iraq", dialCode: "+964" },
  { value: "Ireland", label: "Ireland", dialCode: "+353" },
  { value: "Israel", label: "Israel", dialCode: "+972" },
  { value: "Italy", label: "Italy", dialCode: "+39" },
  { value: "Jamaica", label: "Jamaica", dialCode: "+1" },
  { value: "Japan", label: "Japan", dialCode: "+81" },
  { value: "Jordan", label: "Jordan", dialCode: "+962" },
  { value: "Kazakhstan", label: "Kazakhstan", dialCode: "+7" },
  { value: "Kenya", label: "Kenya", dialCode: "+254" },
  { value: "Kiribati", label: "Kiribati", dialCode: "+686" },
  { value: "Kuwait", label: "Kuwait", dialCode: "+965" },
  { value: "Kyrgyzstan", label: "Kyrgyzstan", dialCode: "+996" },
  { value: "Laos", label: "Laos", dialCode: "+856" },
  { value: "Latvia", label: "Latvia", dialCode: "+371" },
  { value: "Lebanon", label: "Lebanon", dialCode: "+961" },
  { value: "Lesotho", label: "Lesotho", dialCode: "+266" },
  { value: "Liberia", label: "Liberia", dialCode: "+231" },
  { value: "Libya", label: "Libya", dialCode: "+218" },
  { value: "Liechtenstein", label: "Liechtenstein", dialCode: "+423" },
  { value: "Lithuania", label: "Lithuania", dialCode: "+370" },
  { value: "Luxembourg", label: "Luxembourg", dialCode: "+352" },
  { value: "Macau", label: "Macau", dialCode: "+853" },
  { value: "Madagascar", label: "Madagascar", dialCode: "+261" },
  { value: "Malawi", label: "Malawi", dialCode: "+265" },
  { value: "Malaysia", label: "Malaysia", dialCode: "+60" },
  { value: "Maldives", label: "Maldives", dialCode: "+960" },
  { value: "Mali", label: "Mali", dialCode: "+223" },
  { value: "Malta", label: "Malta", dialCode: "+356" },
  { value: "Marshall Islands", label: "Marshall Islands", dialCode: "+692" },
  { value: "Mauritania", label: "Mauritania", dialCode: "+222" },
  { value: "Mauritius", label: "Mauritius", dialCode: "+230" },
  { value: "Mexico", label: "Mexico", dialCode: "+52" },
  { value: "Micronesia", label: "Micronesia", dialCode: "+691" },
  { value: "Moldova", label: "Moldova", dialCode: "+373" },
  { value: "Monaco", label: "Monaco", dialCode: "+377" },
  { value: "Mongolia", label: "Mongolia", dialCode: "+976" },
  { value: "Montenegro", label: "Montenegro", dialCode: "+382" },
  { value: "Morocco", label: "Morocco", dialCode: "+212" },
  { value: "Mozambique", label: "Mozambique", dialCode: "+258" },
  { value: "Myanmar", label: "Myanmar", dialCode: "+95" },
  { value: "Namibia", label: "Namibia", dialCode: "+264" },
  { value: "Nauru", label: "Nauru", dialCode: "+674" },
  { value: "Nepal", label: "Nepal", dialCode: "+977" },
  { value: "Netherlands", label: "Netherlands", dialCode: "+31" },
  { value: "New Zealand", label: "New Zealand", dialCode: "+64" },
  { value: "Nicaragua", label: "Nicaragua", dialCode: "+505" },
  { value: "Niger", label: "Niger", dialCode: "+227" },
  { value: "Nigeria", label: "Nigeria", dialCode: "+234" },
  { value: "North Korea", label: "North Korea", dialCode: "+850" },
  { value: "North Macedonia", label: "North Macedonia", dialCode: "+389" },
  { value: "Norway", label: "Norway", dialCode: "+47" },
  { value: "Oman", label: "Oman", dialCode: "+968" },
  { value: "Pakistan", label: "Pakistan", dialCode: "+92" },
  { value: "Palau", label: "Palau", dialCode: "+680" },
  { value: "Palestine", label: "Palestine", dialCode: "+970" },
  { value: "Panama", label: "Panama", dialCode: "+507" },
  { value: "Papua New Guinea", label: "Papua New Guinea", dialCode: "+675" },
  { value: "Paraguay", label: "Paraguay", dialCode: "+595" },
  { value: "Peru", label: "Peru", dialCode: "+51" },
  { value: "Philippines", label: "Philippines", dialCode: "+63" },
  { value: "Poland", label: "Poland", dialCode: "+48" },
  { value: "Portugal", label: "Portugal", dialCode: "+351" },
  { value: "Qatar", label: "Qatar", dialCode: "+974" },
  { value: "Romania", label: "Romania", dialCode: "+40" },
  { value: "Russia", label: "Russia", dialCode: "+7" },
  { value: "Rwanda", label: "Rwanda", dialCode: "+250" },
  { value: "Saint Kitts and Nevis", label: "Saint Kitts and Nevis", dialCode: "+1" },
  { value: "Saint Lucia", label: "Saint Lucia", dialCode: "+1" },
  { value: "Saint Vincent and the Grenadines", label: "Saint Vincent and the Grenadines", dialCode: "+1" },
  { value: "Samoa", label: "Samoa", dialCode: "+685" },
  { value: "San Marino", label: "San Marino", dialCode: "+378" },
  { value: "Sao Tome and Principe", label: "Sao Tome and Principe", dialCode: "+239" },
  { value: "Saudi Arabia", label: "Saudi Arabia", dialCode: "+966" },
  { value: "Senegal", label: "Senegal", dialCode: "+221" },
  { value: "Serbia", label: "Serbia", dialCode: "+381" },
  { value: "Seychelles", label: "Seychelles", dialCode: "+248" },
  { value: "Sierra Leone", label: "Sierra Leone", dialCode: "+232" },
  { value: "Singapore", label: "Singapore", dialCode: "+65" },
  { value: "Slovakia", label: "Slovakia", dialCode: "+421" },
  { value: "Slovenia", label: "Slovenia", dialCode: "+386" },
  { value: "Solomon Islands", label: "Solomon Islands", dialCode: "+677" },
  { value: "Somalia", label: "Somalia", dialCode: "+252" },
  { value: "South Africa", label: "South Africa", dialCode: "+27" },
  { value: "South Korea", label: "South Korea", dialCode: "+82" },
  { value: "South Sudan", label: "South Sudan", dialCode: "+211" },
  { value: "Spain", label: "Spain", dialCode: "+34" },
  { value: "Sri Lanka", label: "Sri Lanka", dialCode: "+94" },
  { value: "Sudan", label: "Sudan", dialCode: "+249" },
  { value: "Suriname", label: "Suriname", dialCode: "+597" },
  { value: "Sweden", label: "Sweden", dialCode: "+46" },
  { value: "Switzerland", label: "Switzerland", dialCode: "+41" },
  { value: "Syria", label: "Syria", dialCode: "+963" },
  { value: "Taiwan", label: "Taiwan", dialCode: "+886" },
  { value: "Tajikistan", label: "Tajikistan", dialCode: "+992" },
  { value: "Tanzania", label: "Tanzania", dialCode: "+255" },
  { value: "Thailand", label: "Thailand", dialCode: "+66" },
  { value: "Timor-Leste", label: "Timor-Leste", dialCode: "+670" },
  { value: "Togo", label: "Togo", dialCode: "+228" },
  { value: "Tonga", label: "Tonga", dialCode: "+676" },
  { value: "Trinidad and Tobago", label: "Trinidad and Tobago", dialCode: "+1" },
  { value: "Tunisia", label: "Tunisia", dialCode: "+216" },
  { value: "Turkey", label: "Turkey", dialCode: "+90" },
  { value: "Turkmenistan", label: "Turkmenistan", dialCode: "+993" },
  { value: "Tuvalu", label: "Tuvalu", dialCode: "+688" },
  { value: "Uganda", label: "Uganda", dialCode: "+256" },
  { value: "Ukraine", label: "Ukraine", dialCode: "+380" },
  { value: "United Arab Emirates", label: "United Arab Emirates", dialCode: "+971" },
  { value: "United Kingdom", label: "United Kingdom", dialCode: "+44" },
  { value: "United States", label: "United States", dialCode: "+1" },
  { value: "Uruguay", label: "Uruguay", dialCode: "+598" },
  { value: "Uzbekistan", label: "Uzbekistan", dialCode: "+998" },
  { value: "Vanuatu", label: "Vanuatu", dialCode: "+678" },
  { value: "Vatican City", label: "Vatican City", dialCode: "+39" },
  { value: "Venezuela", label: "Venezuela", dialCode: "+58" },
  { value: "Vietnam", label: "Vietnam", dialCode: "+84" },
  { value: "Yemen", label: "Yemen", dialCode: "+967" },
  { value: "Zambia", label: "Zambia", dialCode: "+260" },
  { value: "Zimbabwe", label: "Zimbabwe", dialCode: "+263" },
  { value: "Other", label: "Other", dialCode: "+" },
]

const DEFAULT_COUNTRY = "United Kingdom"
const DEFAULT_DIAL_CODE = "+44"
const PHONE_CODE_OPTIONS = COUNTRY_OPTIONS.map((country) => ({
  value: `${country.value}:${country.dialCode}`,
  dialCode: country.dialCode,
  label: `${country.dialCode} ${country.label}`,
}))

const getDialCode = (country: string) => COUNTRY_OPTIONS.find((option) => option.value === country)?.dialCode ?? DEFAULT_DIAL_CODE

const parsePhoneValue = (value: string) => {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\+(?:\d{1,4})?)\s*(.*)$/)

  if (!match) {
    return { dialCode: DEFAULT_DIAL_CODE, number: trimmed }
  }

  return { dialCode: match[1], number: match[2] ?? "" }
}

type CountrySelectProps = {
  value?: string
  onValueChange: (value: string) => void
  className?: string
  disabled?: boolean
}

export function CountrySelect({ value, onValueChange, className, disabled = false }: CountrySelectProps) {
  return (
    <Select value={value || DEFAULT_COUNTRY} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className ?? "w-full bg-white/50"}>
        <SelectValue placeholder="Select country" />
      </SelectTrigger>
      <SelectContent searchPlaceholder="Search country...">
        {COUNTRY_OPTIONS.map((country) => (
          <SelectItem key={country.value} value={country.value}>
            {country.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type PhoneInputProps = {
  value: string
  onChange: (value: string) => void
  className?: string
  inputClassName?: string
  placeholder?: string
  disabled?: boolean
}

export function PhoneInput({ value, onChange, className, inputClassName, placeholder = "7700 900000", disabled = false }: PhoneInputProps) {
  const parsed = parsePhoneValue(value)

  const updateValue = (dialCode: string, number: string) => {
    const cleanedNumber = number.trimStart()
    onChange(cleanedNumber ? `${dialCode} ${cleanedNumber}` : dialCode)
  }

  return (
    <div className={className ?? "relative grid grid-cols-1 gap-2 min-[360px]:grid-cols-[140px_minmax(0,1fr)]"}>
      <PhoneCodeDropdown
        value={parsed.dialCode}
        onChange={(dialCode) => updateValue(dialCode, parsed.number)}
        disabled={disabled}
      />
      <Input
        type="tel"
        placeholder={placeholder}
        value={parsed.number}
        onChange={(event) => updateValue(parsed.dialCode, event.target.value)}
        className={cn("min-[360px]:col-start-2 min-[360px]:row-start-1", inputClassName ?? "bg-white/50")}
        disabled={disabled}
      />
    </div>
  )
}

type PhoneCodeDropdownProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function PhoneCodeDropdown({ value, onChange, disabled = false }: PhoneCodeDropdownProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = PHONE_CODE_OPTIONS.filter((country) =>
    country.label.toLowerCase().includes(normalizedQuery)
  )

  React.useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    window.setTimeout(() => searchRef.current?.focus(), 0)

    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-white/50 px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        )}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery("")
          setOpen((current) => !current)
        }}
      >
        <span className="truncate font-medium">{value || DEFAULT_DIAL_CODE}</span>
        <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-72 max-w-[calc(94vw-3rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md min-[360px]:w-80">
          <div className="border-b bg-popover p-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search country code..."
                className="h-9 bg-background pl-8"
              />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto p-1" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">No country codes found.</div>
            ) : (
              filteredOptions.map((country) => (
                <button
                  key={country.value}
                  type="button"
                  role="option"
                  aria-selected={country.dialCode === value}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    country.dialCode === value && "bg-accent/70 font-medium"
                  )}
                  onClick={() => {
                    onChange(country.dialCode)
                    setOpen(false)
                  }}
                >
                  {country.label}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export type AddressValue = {
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
}

export const emptyAddressValue = (): AddressValue => ({
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: DEFAULT_COUNTRY,
})

export const formatAddressValue = (address: AddressValue) =>
  [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.postalCode,
    address.country || DEFAULT_COUNTRY,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")

const normalizeCountryValue = (country?: string) => {
  const normalized = String(country ?? "").trim().toLowerCase()
  if (!normalized) return DEFAULT_COUNTRY
  if (["uk", "u.k.", "gb", "great britain", "england", "united kingdom"].includes(normalized)) return DEFAULT_COUNTRY
  return COUNTRY_OPTIONS.find((option) => option.value.toLowerCase() === normalized)?.value ?? country?.trim() ?? DEFAULT_COUNTRY
}

export const parseAddressValue = (address?: string | null): AddressValue => {
  const parts = String(address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 3) {
    return {
      addressLine1: parts[0] ?? "",
      addressLine2: "",
      city: parts[1] ?? "",
      state: "",
      postalCode: "",
      country: normalizeCountryValue(parts[2]),
    }
  }

  return {
    addressLine1: parts[0] ?? "",
    addressLine2: parts[1] ?? "",
    city: parts[2] ?? "",
    state: parts[3] ?? "",
    postalCode: parts[4] ?? "",
    country: normalizeCountryValue(parts[5]),
  }
}

type AddressFieldsProps = {
  value: AddressValue
  onChange: (value: AddressValue) => void
  className?: string
  disabled?: boolean
}

export function AddressFields({ value, onChange, className, disabled = false }: AddressFieldsProps) {
  const setField = (field: keyof AddressValue, nextValue: string) => {
    onChange({ ...value, [field]: nextValue })
  }

  return (
    <div className={className ?? "grid grid-cols-1 md:grid-cols-2 gap-4"}>
      <div className="space-y-2 md:col-span-2">
        <Label optional>Address Line 1</Label>
        <Input
          placeholder="Street address"
          value={value.addressLine1}
          onChange={(event) => setField("addressLine1", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label optional>Address Line 2</Label>
        <Input
          placeholder="Suite, floor, or building"
          value={value.addressLine2}
          onChange={(event) => setField("addressLine2", event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label optional>City</Label>
        <Input placeholder="City" value={value.city} onChange={(event) => setField("city", event.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-2">
        <Label optional>County / State</Label>
        <Input placeholder="County or state" value={value.state} onChange={(event) => setField("state", event.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-2">
        <Label optional>Postcode / ZIP</Label>
        <Input placeholder="Postcode or ZIP" value={value.postalCode} onChange={(event) => setField("postalCode", event.target.value)} disabled={disabled} />
      </div>
      <div className="space-y-2">
        <Label optional>Country</Label>
        <CountrySelect value={value.country || DEFAULT_COUNTRY} onValueChange={(country) => setField("country", country)} disabled={disabled} />
      </div>
    </div>
  )
}

export const getDefaultCountry = () => DEFAULT_COUNTRY
export const getDefaultDialCode = () => DEFAULT_DIAL_CODE
export const getCountryDialCode = getDialCode
