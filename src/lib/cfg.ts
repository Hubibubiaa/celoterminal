import { erc20Registry } from "./erc20/registry"
import { erc20Devchain } from "./erc20/registry-devchain"
import { RegisteredErc20 } from "./erc20/core"
import { spectronChainId } from "./spectron-utils/constants"

export const mainnetChainId = "42220"
export const baklavaChainId = "62320"
export const alfajoresChainId = "44787"
const defaultChainId = mainnetChainId
const defaultAccountsDB = "home/.celoterminal/celoaccounts.db"

const defaultNetworks: {[key: string]: string} = {
	[mainnetChainId]: "https://forno.celo.org",
	[baklavaChainId]: "https://baklava-forno.celo-testnet.org",
	[alfajoresChainId]: "https://alfajores-forno.celo-testnet.org",
}
const fallbackNetworkURL = "http://localhost:7545"

export type PathRoot = "home" | "userData"

interface Config {
	chainId: string,
	defaultNetworkURL: string,
	accountsDBPath: {
		root: PathRoot,
		path: string[],
	},
}

let _CFG: Config
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const CFG = (): Config => {
	if (!_CFG) {
		const chainId =
			process.env["CELOTERMINAL_NETWORK_ID"] ||
			defaultChainId
		const defaultNetworkURL =
			process.env["CELOTERMINAL_NETWORK_URL"] ||
			defaultNetworks[chainId] ||
			fallbackNetworkURL
		const accountsDBPath =
			process.env["CELOTERMINAL_ACCOUNTS_DB"] ||
			defaultAccountsDB
		const accountsDBPathParts = accountsDBPath.split("/")

		_CFG = {
			chainId: chainId,
			defaultNetworkURL,
			accountsDBPath: {
				root: accountsDBPathParts[0] as PathRoot,
				path: accountsDBPathParts.slice(1),
			},
		}
	}
	return _CFG
}

const networkNames: {[key: string]: string} = {
	[mainnetChainId]: "Mainnet",
	[baklavaChainId]: "Baklava",
	[alfajoresChainId]: "Alfajores",
}
export const networkName = (chainId: string): string => {
	return networkNames[chainId] || `ChainId: ${chainId}`
}

const _registeredErc20s = (): RegisteredErc20[] => {
	const chainId = CFG().chainId
	switch (chainId) {
	case spectronChainId:
		return erc20Devchain
	default:
		return erc20Registry.map((e) => ({
			name: e.name,
			symbol: e.symbol,
			decimals: e.decimals,
			conversion: e.conversion,
			address:
				chainId === mainnetChainId ? e.addresses.mainnet :
				chainId === baklavaChainId ? e.addresses.baklava :
				chainId === alfajoresChainId ? e.addresses.alfajores : undefined,
		})).filter((e) => e.address !== undefined)
	}
}
export const registeredErc20s = _registeredErc20s()

export const explorerRootURL = (): string => {
	switch (CFG().chainId) {
	case mainnetChainId:
		return "https://explorer.celo.org"
	case baklavaChainId:
		return "https://baklava-blockscout.celo-testnet.org"
	case alfajoresChainId:
		return "https://alfajores-blockscout.celo-testnet.org"
	default:
		// just a fake URL.
		return `https://explorer.network.${CFG().chainId}`
	}
}
