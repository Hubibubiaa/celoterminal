import BigNumber from 'bignumber.js'
import { fmtAddress, fmtAmount } from '../../../lib/utils'
import { explorerRootURL } from '../../../lib/cfg'

import * as React from 'react'
import Box from '@material-ui/core/Box'
import {
	LinearProgress, Typography, Paper, Table, TableBody,
	TableHead, TableRow, TableCell, Tooltip
} from '@material-ui/core'

import Link from '../../components/link'

const TransferHistory = (props: {
	address: string,
	events?: {
		timestamp: Date,
		txHash: string,
		from: string,
		to: string,
		amount: BigNumber,
	}[],
	erc20?: {
		name: string,
		decimals: number,
	}
}): JSX.Element => {

	const events = props.events
	const erc20 = props.erc20
	const explorerURL = explorerRootURL()
	return (
		<Paper>
			<Box p={2}>
				<Typography variant="h6" color="textSecondary">Recent Transfers</Typography>
				{!events || !erc20 ? <LinearProgress /> : <>
				<Box display="flex" flex={1} overflow="auto" height="100vh">
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell>Date</TableCell>
								<TableCell width="100%">Transfer</TableCell>
								<TableCell style={{whiteSpace: "nowrap"}} align="right">Amount</TableCell>
								<TableCell>TXHash</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
						{
							events && erc20 &&
							events.map((e) => {
								const addr = e.from === props.address ? e.to : e.from
								return (
									<TableRow key={e.txHash}>
										<Tooltip title={e.timestamp.toLocaleString()}>
										<TableCell>{e.timestamp.toLocaleDateString()}</TableCell>
										</Tooltip>
										<TableCell style={{fontFamily: "monospace"}}>
											{e.from === props.address ? `\u00a0\u00a0To\u00a0` : `From\u00a0`}
											<Link href={`${explorerURL}/address/${addr}`} style={{fontFamily: "monospace"}}>
												{fmtAddress(addr)}
											</Link>
										</TableCell>
										<TableCell style={{
											whiteSpace: "nowrap",
											color: (e.to === props.address) ? "#4caf50" : undefined,
											}} align="right">
											{e.to === props.address ? `+` : ``}
											{fmtAmount(e.amount, erc20.decimals)} {erc20.name}
										</TableCell>
										<TableCell>
											<Link href={`${explorerURL}/tx/${e.txHash}`} style={{fontFamily: "monospace"}}>
												{fmtAddress(e.txHash)}
											</Link>
										</TableCell>
									</TableRow>
								)
							})
						}
						</TableBody>
					</Table>
				</Box>
				</>}
			</Box>
		</Paper>
	)
}
export default TransferHistory