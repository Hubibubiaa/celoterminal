import log from 'electron-log'
import { newKit } from '@celo/contractkit'
import { CeloTxReceipt } from '@celo/connect'

import { TXFinishFunc, TXFunc } from '../../components/app-definition'
import { EstimatedFee, estimateGas } from './fee-estimation'
import { ParsedTransaction, parseTransaction } from './transaction-parser'
import { createWallet } from './wallet'
import { CFG, explorerRootURL } from '../../../lib/cfg'
import { SpectronNetworkId } from '../../../lib/spectron-utils/constants'
import { nowMS } from '../../state/time'
import { sleep } from '../../../lib/utils'
import { transformError } from '../ledger-utils'
import { Account } from '../../../lib/accounts'
import { cfgNetworkURL } from '../../state/kit'

import * as React from 'react'
import {
	makeStyles, Dialog, DialogContent, DialogActions,
	Paper, Box, Typography, LinearProgress, List, ListItem, ListItemIcon,
	Button, ListItemText
} from '@material-ui/core'
import { Send, CheckCircle } from '@material-ui/icons'

import TransactionInfo from './transaction-info'
import PromptLedgerAction from './prompt-ledger-action'
import Link from '../../components/link'

export class TXCancelled extends Error {
	constructor() { super('Cancelled') }
}


const useStyles = makeStyles((theme) => ({
	root: {
		minWidth: 600,
	},
	progressText: {
		fontStyle: "italic",
	},
	successText: {
		fontStyle: "italic",
		color: theme.palette.success.main,
	},
	address: {
		fontFamily: "monospace",
		fontSize: theme.typography.body2.fontSize,
	},
}))

const RunTXs = (props: {
	selectedAccount: Account,
	password?: string,
	txFunc: TXFunc,
	onFinish: TXFinishFunc,
}): JSX.Element => {
	const classes = useStyles()
	const [preparedTXs, setPreparedTXs] = React.useState<ParsedTransaction[]>([])
	const [currentTX, setCurrentTX] = React.useState<{
		idx: number,
		estimatedFee: EstimatedFee,
		confirm: () => void,
		cancel: () => void,
	} | undefined>()
	const [stage, setStage] = React.useState<
		"preparing"  |
		"confirming" |
		"sending"    |
		"finishing">("preparing")
	const [txSendMS, setTXSendMS] = React.useState(0)

	const txFunc = props.txFunc
	const onFinish = props.onFinish
	const selectedAccount = props.selectedAccount
	const password = props.password
	React.useEffect(() => {
		(async () => {
			try {
				const w = await createWallet(selectedAccount, password)
				const cfg = CFG()
				if (cfg.networkId !== SpectronNetworkId) {
					// NOTE: see comment in `createWallet` about limitations of celo-devchain.
					const accounts = w.wallet.getAccounts()
					if (accounts.length !== 1 ||
						accounts[0].toLowerCase() !== selectedAccount.address.toLowerCase()) {
						throw new Error(
							`Unexpected Account. Expected: ${selectedAccount.address}, Got: ${accounts[0]}. ` +
							`Refusing to run transactions.`)
					}
				}
				const kit = newKit(cfgNetworkURL(), w.wallet)
				kit.defaultAccount = selectedAccount.address
				try {
					const networkId = (await kit.web3.eth.net.getId()).toString()
					if (networkId !== cfg.networkId) {
						throw new Error(
							`Unexpected NetworkId. Expected: ${cfg.networkId}, Got: ${networkId}. ` +
							`Refusing to run transactions.`)
					}
					const txs = await txFunc(kit)
					if (txs.length === 0) {
						throw new Error(`No transactions to run.`)
					}
					const parsedTXs: ParsedTransaction[] = []
					for (const tx of txs) {
						const parsedTX = await parseTransaction(kit, tx)
						parsedTXs.push(parsedTX)
					}
					setPreparedTXs(parsedTXs)

					const r: CeloTxReceipt[] = []
					for (let idx = 0; idx < txs.length; idx += 1) {
						const tx = txs[idx]
						const estimatedGas = await estimateGas(kit, tx)
						// TODO(zviadm): Add support for other fee currencies.
						const gasPrice = await kit.connection.gasPrice()
						const estimatedFee = {
							estimatedGas,
							feeCurrency: "CELO",
							estimatedFee: estimatedGas.multipliedBy(gasPrice).shiftedBy(-18),
						}

						const txPromise = new Promise<void>((resolve, reject) => {
							setCurrentTX({
								idx: idx,
								estimatedFee: estimatedFee,
								confirm: () => {
									setStage("sending")
									resolve()
								},
								cancel: () => {
									setStage("sending")
									reject(new TXCancelled())
								}
							})
						})
						log.info(`TX:`, parsedTXs[idx])

						setTXSendMS(0)
						setTXProgress(0)
						setStage("confirming")
						if (selectedAccount.type === "local") {
							// No need to show confirmation dialog for Ledger accounts.
							await txPromise
						}
						const result = await tx.tx.send({
							...tx.params,
							// perf improvement, avoid re-estimating gas again.
							gas: estimatedGas.toNumber(),
						})
						const txHash = await result.getHash()
						setStage("sending")
						setTXSendMS(nowMS())
						log.info(`TX-HASH:`, txHash)

						const receipt = await result.waitReceipt()
						setTXProgress(100)
						log.info(`TX-RECEIPT:`, receipt)
						r.push(receipt)
					}
					setStage("finishing")
					// Wait a bit after final TX so that it is more likely that blockchain state
					// is now updated in most of the full nodes.
					await sleep(500)
					onFinish(undefined, r)
				} finally {
					kit.stop()
					if (w.transport) {
						await w.transport.close()
					}
				}
			} catch (e) {
				onFinish(transformError(e))
			}
		})()
	// NOTE: This effect is expected to run only once on first render and it is expected
	// that parent will unmount the component once it calls onFinish.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	const [txProgress, setTXProgress] = React.useState(0)
	React.useEffect(() => {
		if (stage !== "sending") {
			return
		}
		const timer = setInterval(() => {
			const progress = (
				txSendMS === 0 ? 0 : Math.min(99, (nowMS() - txSendMS) / 5000 * 100.0))
			setTXProgress((txProgress) => Math.max(progress, txProgress))
		}, 200)
		return () => { clearInterval(timer) }
	}, [stage, txSendMS]);
	const explorerURL = explorerRootURL()
	return (
		<Dialog
			id="tx-runner-modal"
			open={true}>
			<DialogContent className={classes.root}>
				<Box display="flex" flexDirection="column">
					{
					stage === "preparing" || !currentTX ?
					<>
						<Typography className={classes.progressText}>Preparing transactions...</Typography>
						<LinearProgress color="primary" />
					</>
					:
					<>
						<Paper>
							<List dense={true}>
								{preparedTXs.map((tx, idx) => (
									<ListItem key={`${idx}`}>
										<ListItemIcon>
											{
											(idx < currentTX.idx || stage === "finishing") ?
											<CheckCircle /> :
											(idx === currentTX.idx) ? <Send /> : <></>
											}
										</ListItemIcon>
										<ListItemText
											primary={<Typography className={classes.address}>
											Contract: <Link
												href={`${explorerURL}/address/${preparedTXs[idx].contractAddress}/contracts`}
												>{preparedTXs[idx].contractName}</Link>
											</Typography>}
										/>
									</ListItem>
								))}
							</List>
						</Paper>
						<Box marginTop={1}>
							<TransactionInfo tx={preparedTXs[currentTX.idx]} fee={currentTX.estimatedFee} />
						</Box>
						<Box marginTop={1}>
							<LinearProgress
								style={{visibility: stage === "confirming" ? "hidden" : undefined}}
								color="primary"
								variant="determinate"
								value={txProgress}
								/>
						</Box>
					</>
					}
				</Box>
			</DialogContent>
			<DialogActions>
				{props.selectedAccount.type === "ledger" ?
				stage === "confirming" &&
				<PromptLedgerAction text="Confirm transaction on Ledger..." />
				:
				<>
					<Button
						id="cancel-tx"
						onClick={currentTX?.cancel}
						disabled={stage !== "confirming"}>Cancel</Button>
					<Button
						id="confirm-tx"
						onClick={currentTX?.confirm}
						disabled={stage !== "confirming"}>Confirm</Button>
				</>
				}
			</DialogActions>
		</Dialog>
	)
}
export default RunTXs